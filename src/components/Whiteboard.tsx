'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
  Tldraw,
  BaseBoxShapeTool,
  TLUiOverrides,
  TLComponents,
  useTools,
  useIsToolSelected,
  DefaultToolbar,
  DefaultToolbarContent,
  TldrawUiMenuItem,
  Editor,
  createShapeId,
  DefaultFontFamilies,
  getSnapshot,
  loadSnapshot,
  DefaultPageMenu
} from 'tldraw';
import 'tldraw/tldraw.css';
import { NoteShapeUtil, FixedBuiltInNoteUtil, TEXT_COLORS, FONT_SIZES } from './NoteShape';

const NOTE_COLORS: Record<string, string> = {
  yellow: '#fef08a', 'light-red': '#fecaca', 'light-blue': '#bae6fd', 'light-green': '#d9f99d',
  orange: '#fed7aa', 'light-violet': '#e0e7ff', blue: '#bfdbfe', violet: '#c7d2fe',
  green: '#bbf7d0', red: '#fca5a5', black: '#e2e8f0', grey: '#f8fafc',
};

const extractTextFromShape = (shape: any): string => {
  if (!shape || !shape.props) return '';
  if (typeof shape.props.text === 'string') return shape.props.text;
  if (shape.props.richText && Array.isArray(shape.props.richText.content)) {
    let extracted = '';
    const traverse = (nodes: any[]) => {
      for (const node of nodes) {
        if (node.type === 'text' && typeof node.text === 'string') {
          extracted += node.text;
        }
        if (node.content && Array.isArray(node.content)) {
          traverse(node.content);
        }
      }
    };
    traverse(shape.props.richText.content);
    return extracted;
  }
  return '';
};

const getSnapshotRecords = (snapshot: any): any[] => {
  if (!snapshot) return [];
  if (snapshot.document && snapshot.document.store) return Object.values(snapshot.document.store);
  if (snapshot.store) return Object.values(snapshot.store);
  return Object.values(snapshot);
};

const processBoardResourcesRecursively = async (boardId: string, action: 'DELETE' | 'PUT') => {
  try {
    const res = await fetch(`/api/board/${boardId}`);
    const data = await res.json();
    if (!data || !data.elements) return;

    let elements = data.elements;
    if (typeof elements === 'string') elements = JSON.parse(elements);
    if (typeof elements === 'string') elements = JSON.parse(elements);

    let shapes: any[] = [];
    let assets: any[] = [];

    if (elements.snapshot) {
      const records = getSnapshotRecords(elements.snapshot);
      shapes = records.filter(r => r.typeName === 'shape');
      assets = records.filter(r => r.typeName === 'asset');
    } else {
      shapes = (elements && !Array.isArray(elements) && elements.shapes) ? elements.shapes : (Array.isArray(elements) ? elements : []);
      assets = (elements && !Array.isArray(elements) && elements.assets) ? elements.assets : [];
    }

    assets.forEach((asset: any) => {
      const fileUrl = asset.props?.src;
      if (fileUrl && fileUrl.startsWith('/uploads/')) {
        fetch('/api/upload', { method: action, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: fileUrl }) }).catch(() => { });
      }
    });

    shapes.forEach((shape: any) => {
      if (shape.type === 'custom-note') {
        const thumbnailUrl = shape.props?.thumbnailUrl;
        if (thumbnailUrl && thumbnailUrl.startsWith('/uploads/')) {
          fetch('/api/upload', { method: action, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: thumbnailUrl }) }).catch(() => { });
        }
        if (shape.props?.childBoardId) {
          processBoardResourcesRecursively(shape.props.childBoardId, action);
        }
      }
    });
  } catch (e) {
    console.error(`递归处理子白板资源失败 (${action}): ${boardId}`, e);
  }
};

DefaultFontFamilies.draw = 'Xiaolai';

export class NoteTool extends BaseBoxShapeTool {
  static override id = 'custom-note';
  static override initial = 'idle';
  override shapeType = 'custom-note' as const;
}

const customShapeUtils = [NoteShapeUtil, FixedBuiltInNoteUtil];
const customTools = [NoteTool];

const uiOverrides: TLUiOverrides = {
  tools(editor, tools) {
    tools['custom-note'] = { id: 'custom-note', icon: 'tool-note', label: '子白板便签', kbd: 'n', onSelect: () => editor.setCurrentTool('custom-note') };
    return tools;
  },
};

export default function Whiteboard({ boardId }: { boardId: string }) {
  const router = useRouter();
  const editorRef = useRef<Editor | null>(null);

  const [fontLoaded, setFontLoaded] = useState(false);

  useEffect(() => {
    const loadCustomFont = async () => {
      try {
        const customFont = new FontFace('Xiaolai', 'url(/fonts/Xiaolai-Regular.ttf)');
        await customFont.load();
        document.fonts.add(customFont);
        setFontLoaded(true);
      } catch (e) {
        console.error('字体强制加载失败:', e);
        setFontLoaded(true);
      }
    };
    loadCustomFont();
  }, []);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [noteTitle, setNoteTitle] = useState('');
  const noteTitleRef = useRef('');
  const [noteImg, setNoteImg] = useState('');
  const noteImgRef = useRef('');
  const [noteDescription, setNoteDescription] = useState('');
  const noteDescriptionRef = useRef('');

  const [selectedNote, setSelectedNote] = useState<any | null>(null);
  const [sliderBase, setSliderBase] = useState<any | null>(null);
  const [textEditTab, setTextEditTab] = useState<'title' | 'desc'>('title');

  const [boardName, setBoardName] = useState(boardId);
  const boardNameRef = useRef(boardId);

  const parentBoardIdRef = useRef<string | null>(null);
  const autoFillTimeoutRef = useRef<number | null>(null);
  const imgSizeRef = useRef<{ w: number, h: number } | null>(null);

  const isProgrammaticUpdateRef = useRef(false);
  const isParentDataLoadedRef = useRef(false);
  const isTitleCapturedRef = useRef(false);
  const isImgCapturedRef = useRef(false);

  // 【核心优化 1：记录出处 Sheet】不再记录 rootId，而是记录 rootPageId
  const [urlRootPageId, setUrlRootPageId] = useState<string | null>(null);

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const passedRootPageId = urlParams.get('rootPageId');
    if (passedRootPageId) {
      setUrlRootPageId(passedRootPageId);
    }
  }, []);

  // 严格认定只有 main_board_001 是物理根节点
  const isRootBoard = boardId === 'main_board_001';

  const components: TLComponents = {
    Toolbar: (props) => {
      const tools = useTools();
      const isNoteSelected = useIsToolSelected(tools['custom-note']);
      return (
        <DefaultToolbar {...props}>
          <TldrawUiMenuItem {...tools['custom-note']} isSelected={isNoteSelected} />
          <DefaultToolbarContent />
        </DefaultToolbar>
      );
    },
    PageMenu: isRootBoard ? DefaultPageMenu : () => null,
  };

  const updateParentNoteShape = async (newTitle: string, newImg: string, newDescription: string) => {
    setNoteTitle(newTitle); noteTitleRef.current = newTitle;
    setNoteImg(newImg); noteImgRef.current = newImg;
    setNoteDescription(newDescription); noteDescriptionRef.current = newDescription;

    const validName = newTitle.trim() ? newTitle : boardId;
    setBoardName(validName); boardNameRef.current = validName;

    const targetParentId = parentBoardIdRef.current;
    if (!targetParentId) return false;

    try {
      const res = await fetch(`/api/board/${targetParentId}`);
      const parentData = await res.json();
      let elements = parentData.elements ? parentData.elements : '[]';
      if (typeof elements === 'string') elements = JSON.parse(elements);
      if (typeof elements === 'string') elements = JSON.parse(elements);

      const isNewFormat = !!elements.snapshot;
      let isUpdated = false;

      let imgW = 0, imgH = 0;
      if (newImg) {
        if (imgSizeRef.current) { imgW = imgSizeRef.current.w; imgH = imgSizeRef.current.h; }
        else {
          await new Promise(resolve => {
            const img = new Image();
            img.onload = () => { imgW = img.naturalWidth; imgH = img.naturalHeight; resolve(true); }
            img.onerror = () => resolve(true);
            img.src = newImg;
          });
        }
      }

      if (isNewFormat) {
        const records = getSnapshotRecords(elements.snapshot);
        records.forEach((s: any) => {
          if (s.typeName === 'shape' && s.type === 'custom-note' && s.props?.childBoardId === boardId) {
            isUpdated = true;
            let newW = s.props.w || 240; let newH = s.props.h || 240;

            if (newImg && imgW && imgH) {
              const reservedHeight = 64; const innerWidth = newW - 24;
              newH = (innerWidth / imgW) * imgH + reservedHeight;
            } else if (!newImg) { newH = newW; }

            s.props.title = newTitle;
            s.props.description = newDescription;
            s.props.thumbnailUrl = newImg;
            s.props.w = newW;
            s.props.h = newH;
            if (!s.meta) s.meta = {};
            s.meta.isTitleCaptured = isTitleCapturedRef.current;
            s.meta.isImgCaptured = isImgCapturedRef.current;
          }
        });

        if (isUpdated) {
          imgSizeRef.current = null;
          await fetch(`/api/board/${targetParentId}`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ elements: JSON.stringify(elements) })
          });
          return true;
        }
      } else {
        const shapes = (elements && !Array.isArray(elements) && elements.shapes) ? elements.shapes : (Array.isArray(elements) ? elements : []);
        const newShapes = shapes.map((s: any) => {
          if (s.type === 'custom-note' && s.props?.childBoardId === boardId) {
            isUpdated = true;
            let newW = s.props.w || 240; let newH = s.props.h || 240;
            if (newImg && imgW && imgH) {
              const reservedHeight = 64; const innerWidth = newW - 24;
              newH = (innerWidth / imgW) * imgH + reservedHeight;
            } else if (!newImg) { newH = newW; }

            return {
              ...s,
              props: { ...s.props, title: newTitle, description: newDescription, thumbnailUrl: newImg, w: newW, h: newH },
              meta: { ...(s.meta || {}), isTitleCaptured: isTitleCapturedRef.current, isImgCaptured: isImgCapturedRef.current }
            };
          }
          return s;
        });

        if (isUpdated) {
          imgSizeRef.current = null;
          const payloadElements = elements.shapes ? { ...elements, shapes: newShapes } : newShapes;
          await fetch(`/api/board/${targetParentId}`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ elements: JSON.stringify(payloadElements) })
          });
          return true;
        }
      }
    } catch (e) { console.error(e); }
    return false;
  };

  useEffect(() => {
    const handleNavigate = (e: Event) => {
      const customEvent = e as CustomEvent<string>;
      const childId = customEvent.detail;
      
      // 【核心优化 2：向下专递 Sheet ID】
      let nextRootPageId = urlRootPageId;
      // 如果我们是在根白板里发起的下钻，抓取当前的页签 ID
      if (isRootBoard && editorRef.current) {
        nextRootPageId = editorRef.current.getCurrentPageId();
      }
      
      const queryRootPage = nextRootPageId ? `&rootPageId=${nextRootPageId}` : '';
      router.push(`/board/${childId}?parentId=${boardId}${queryRootPage}`);
    };
    window.addEventListener('tldraw-enter-board', handleNavigate);
    return () => window.removeEventListener('tldraw-enter-board', handleNavigate);
  }, [router, boardId, isRootBoard, urlRootPageId]);

  useEffect(() => {
    if (isRootBoard) {
      isParentDataLoadedRef.current = true;
      return;
    }

    const urlParams = new URLSearchParams(window.location.search);
    const urlParentId = urlParams.get('parentId');

    fetch(`/api/board/${boardId}`)
      .then(res => res.json())
      .then(data => {
        if (data.name) {
          setBoardName(data.name); boardNameRef.current = data.name;
        }
        const finalParentId = data.parentBoardId || urlParentId;
        if (finalParentId) {
          parentBoardIdRef.current = finalParentId;
          return fetch(`/api/board/${finalParentId}`);
        }
      })
      .then(res => res ? res.json() : null)
      .then(parentData => {
        if (parentData && parentData.elements) {
          let elements = parentData.elements;
          if (typeof elements === 'string') elements = JSON.parse(elements);
          if (typeof elements === 'string') elements = JSON.parse(elements);

          let shapes: any[] = [];
          if (elements.snapshot) {
             const records = getSnapshotRecords(elements.snapshot);
             shapes = records.filter((r: any) => r.typeName === 'shape');
          } else {
             shapes = (elements && !Array.isArray(elements) && elements.shapes) ? elements.shapes : (Array.isArray(elements) ? elements : []);
          }

          const myNote = shapes.find((s: any) => s.type === 'custom-note' && s.props?.childBoardId === boardId);
          if (myNote) {
            const fetchedTitle = myNote.props.title || '';
            const fetchedImg = myNote.props.thumbnailUrl || '';
            const fetchedDesc = myNote.props.description || '';

            setNoteTitle(fetchedTitle); noteTitleRef.current = fetchedTitle;
            setNoteImg(fetchedImg); noteImgRef.current = fetchedImg;
            setNoteDescription(fetchedDesc); noteDescriptionRef.current = fetchedDesc;

            const validName = fetchedTitle.trim() ? fetchedTitle : boardId;
            setBoardName(validName); boardNameRef.current = validName;
          }
        }
        isParentDataLoadedRef.current = true;
      })
      .catch(e => { isParentDataLoadedRef.current = true; });
  }, [boardId, isRootBoard]);

  useEffect(() => {
    if (boardName) { document.title = `${boardName} - 恶喵的无限白板`; }
  }, [boardName]);

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !file.type.startsWith('image/')) return;

    const localPreview = URL.createObjectURL(file);
    setNoteImg(localPreview);

    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch('/api/upload', { method: 'POST', body: formData });
      const data = await res.json();
      if (data.url) {
        setNoteImg(data.url); noteImgRef.current = data.url;
        const img = new Image();
        img.onload = () => { imgSizeRef.current = { w: img.naturalWidth, h: img.naturalHeight }; };
        img.src = data.url;
      }
    } catch (e) { console.error('上传图片失败:', e); }
  };

  const handleSaveMeta = async () => {
    isTitleCapturedRef.current = true;
    isImgCapturedRef.current = true;
    const success = await updateParentNoteShape(noteTitleRef.current, noteImgRef.current, noteDescriptionRef.current);
    if (success) { setIsModalOpen(false); }
  };

  if (!fontLoaded) {
    return <div style={{ position: 'fixed', inset: 0, backgroundColor: '#f8fafc' }} />;
  }

  return (
    <div key={boardId} style={{ position: 'fixed', inset: 0 }}>
      <Tldraw
        shapeUtils={customShapeUtils}
        tools={customTools}
        overrides={uiOverrides}
        components={components}
        onMount={(editor) => {
          editor.setCameraOptions({ wheelBehavior: 'zoom' });
          editorRef.current = editor;

          DefaultFontFamilies.draw = 'Xiaolai';
          editor.updateInstanceState({ isFocusMode: false });

          editor.registerExternalAssetHandler('file', async ({ file }) => {
            if (!file.type.startsWith('image/')) throw new Error('目前仅支持图片上传');
            const formData = new FormData();
            formData.append('file', file);

            const res = await fetch('/api/upload', { method: 'POST', body: formData });
            const data = await res.json();

            return await new Promise<any>((resolve, reject) => {
              const img = new Image();
              img.onload = () => {
                resolve({
                  id: `asset:${createShapeId().replace('shape:', '')}`, typeName: 'asset', type: 'image',
                  meta: {},
                  props: { src: data.url, w: img.naturalWidth, h: img.naturalHeight, isAnimated: false, mimeType: file.type, name: file.name }
                });
              };
              img.onerror = () => reject(new Error('图片加载失败'));
              img.src = data.url;
            });
          });

          fetch(`/api/board/${boardId}`)
            .then(res => res.json())
            .then(data => {
              if (!data.elements) return;
              
              let payload = data.elements;
              try {
                if (typeof payload === 'string') payload = JSON.parse(payload);
                if (typeof payload === 'string') payload = JSON.parse(payload); 
                
                isProgrammaticUpdateRef.current = true;
                
                if (payload.snapshot) {
                  loadSnapshot(editor.store, payload.snapshot);
                  
                  // 【核心优化 3：精准降落与无痕擦除】
                  // 如果回到了主面板，检查 URL 里的 targetPageId，并让 Tldraw 自动切过去
                  if (isRootBoard) {
                    const params = new URLSearchParams(window.location.search);
                    const targetPageId = params.get('targetPageId');
                    if (targetPageId) {
                      try {
                        const pages = editor.getPages();
                        // 确保目标 Sheet 真的存在，防止崩溃
                        if (pages.some(p => p.id === targetPageId)) {
                          editor.setCurrentPage(targetPageId as any);
                        }
                        // 擦除 URL 参数，这样用户刷新时就不会被死死卡在这个 Sheet 里了
                        window.history.replaceState(null, '', `/board/main_board_001`);
                      } catch(err) { console.error('切页失败', err); }
                    }
                  }

                  if (payload.locks) {
                     isTitleCapturedRef.current = !!payload.locks.isTitleCaptured;
                     isImgCapturedRef.current = !!payload.locks.isImgCaptured;
                  }
                } else {
                  const elements = Array.isArray(payload) ? { shapes: payload } : payload;
                  if (elements.assets && elements.assets.length > 0) editor.createAssets(elements.assets);
                  if (elements.shapes && elements.shapes.length > 0) editor.createShapes(elements.shapes);
                  if (elements.bindings && elements.bindings.length > 0) editor.createBindings(elements.bindings);
                  if (elements.locks) {
                     isTitleCapturedRef.current = !!elements.locks.isTitleCaptured;
                     isImgCapturedRef.current = !!elements.locks.isImgCaptured;
                  }
                }
                
                (editor as any).history.clear();
              } catch (e) { console.error('加载白板数据失败:', e); }
              finally {
                window.setTimeout(() => { isProgrammaticUpdateRef.current = false; }, 300);
              }
            });

          const cleanupSelection = editor.store.listen(() => {
            const selected = editor.getSelectedShapes().filter(s => s.type === 'custom-note');
            if (selected.length === 1) {
              const s = selected[0];
              setSelectedNote((prev: any) => {
                if (!prev || prev.id !== s.id || prev.rotation !== s.rotation ||
                  prev.opacity !== s.opacity || prev.props?.color !== s.props?.color ||
                  prev.props?.isPinned !== s.props?.isPinned || prev.props?.borderRadius !== s.props?.borderRadius ||
                  prev.props?.zIndex !== s.props?.zIndex ||
                  prev.props?.titleSize !== s.props?.titleSize || prev.props?.descSize !== s.props?.descSize ||
                  prev.props?.titleColor !== s.props?.titleColor || prev.props?.descColor !== s.props?.descColor ||
                  prev.props?.description !== s.props?.description || prev.props?.title !== s.props?.title) {
                  return { ...s };
                }
                return prev;
              });
            } else {
              setSelectedNote(null);
            }
          });

          const cleanupDocument = editor.store.listen((entry) => {
            if (isProgrammaticUpdateRef.current) return;
            if (entry.source !== 'user') return;

            const changedRecords = [
              ...Object.values(entry.changes.added),
              ...Object.values(entry.changes.updated).map((u: any) => u[1]),
              ...Object.values(entry.changes.removed)
            ];

            const isSignificantChange = changedRecords.some((r: any) => 
              r && ['shape', 'asset', 'page', 'instance_page_state', 'document'].includes(r.typeName)
            );

            if (!isSignificantChange) return;

            const addedShapes = Object.values(entry.changes.added).filter((r: any) => r && r.typeName === 'shape') as any[];
            const updatedShapes = Object.values(entry.changes.updated).map((u: any) => u[1]).filter((r: any) => r && r.typeName === 'shape') as any[];
            const removedShapes = Object.values(entry.changes.removed).filter((r: any) => r && r.typeName === 'shape') as any[];
            const changedShapes = [...addedShapes, ...updatedShapes];

            const addedCustomNotes = addedShapes.filter(s => s.type === 'custom-note');
            if (addedCustomNotes.length > 0) {
              const allNotes = editor.getCurrentPageShapes().filter(s => s.type === 'custom-note') as any[];
              const maxZ = allNotes.reduce((max, n) => Math.max(max, (n.props as any)?.zIndex || 0), 0);
              const updates = addedCustomNotes.map((s, idx) => {
                const randomAngle = (Math.floor(Math.random() * 31) - 15) * Math.PI / 180;
                return { id: s.id, type: 'custom-note', rotation: randomAngle, props: { zIndex: maxZ + 1 + idx } };
              });
              editor.updateShapes(updates as any);
              editor.bringToFront(addedCustomNotes.map(s => s.id));
            }

            const addedAssets = Object.values(entry.changes.added).filter((r: any) => r && r.typeName === 'asset') as any[];
            const updatedAssets = Object.values(entry.changes.updated).map((u: any) => u[1]).filter((r: any) => r && r.typeName === 'asset') as any[];
            const removedAssets = Object.values(entry.changes.removed).filter((r: any) => r && r.typeName === 'asset') as any[];
            const changedAssets = [...addedAssets, ...updatedAssets];

            if (addedAssets.length > 0) {
              addedAssets.forEach(async (asset: any) => {
                const fileUrl = asset.props?.src;
                if (fileUrl && fileUrl.startsWith('/uploads/')) {
                  try { await fetch('/api/upload', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: fileUrl }) }); } catch (e) { }
                }
              });
            }

            addedShapes.forEach((shape: any) => {
              if (shape.type === 'custom-note') {
                if (shape.props?.thumbnailUrl?.startsWith('/uploads/')) {
                  fetch('/api/upload', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: shape.props.thumbnailUrl }) }).catch(() => {});
                }
                if (shape.props?.childBoardId) {
                  processBoardResourcesRecursively(shape.props.childBoardId, 'PUT');
                }
              }
            });

            if (!isRootBoard && !isParentDataLoadedRef.current) return;

            if (!isRootBoard) {
              if (!isTitleCapturedRef.current) {
                for (const shape of changedShapes) {
                  const textProp = extractTextFromShape(shape);
                  if (textProp && textProp.trim() !== '') {
                    if (autoFillTimeoutRef.current) window.clearTimeout(autoFillTimeoutRef.current);
                    const newText = textProp.trim();
                    autoFillTimeoutRef.current = window.setTimeout(() => {
                      if (!isTitleCapturedRef.current) {
                        isTitleCapturedRef.current = true;
                        updateParentNoteShape(newText, noteImgRef.current, noteDescriptionRef.current);
                      }
                    }, 2000);
                    break;
                  }
                }
              }

              if (!isImgCapturedRef.current) {
                let foundImgSrc = ''; let foundW = 0; let foundH = 0;
                for (const asset of changedAssets) {
                  if (asset.type === 'image' && asset.props?.src && !asset.props.src.includes('via.placeholder.com')) {
                    foundImgSrc = asset.props.src; foundW = asset.props.w; foundH = asset.props.h; break;
                  }
                }
                if (!foundImgSrc) {
                  for (const shape of changedShapes) {
                    if (shape.type === 'image' && shape.props?.assetId) {
                      const asset = editor.getAsset(shape.props.assetId);
                      if (asset && (asset as any).props?.src && !(asset as any).props.src.includes('via.placeholder.com')) {
                        foundImgSrc = (asset as any).props.src; foundW = (asset as any).props.w; foundH = (asset as any).props.h; break;
                      }
                    }
                  }
                }
                if (foundImgSrc) {
                  isImgCapturedRef.current = true;
                  if (foundW && foundH) { imgSizeRef.current = { w: foundW, h: foundH }; }
                  updateParentNoteShape(noteTitleRef.current, foundImgSrc, noteDescriptionRef.current);
                }
              }
            }

            const allDocumentShapes = editor.store.allRecords().filter(r => r.typeName === 'shape');
            const allAssets = editor.store.allRecords().filter(r => r.typeName === 'asset');
            
            const usedAssetIds = new Set(allDocumentShapes.map((s: any) => s.props?.assetId).filter(Boolean));
            const orphanedAssets = allAssets.filter(a => !usedAssetIds.has(a.id));

            if (orphanedAssets.length > 0) {
              orphanedAssets.forEach(async (asset: any) => {
                const fileUrl = asset.props?.src;
                if (fileUrl && fileUrl.startsWith('/uploads/')) {
                  try { await fetch('/api/upload', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: fileUrl }) }); } catch (e) { }
                }
              });
              editor.deleteAssets(orphanedAssets.map(a => a.id));
            }

            const usedThumbnails = new Set(
              allDocumentShapes.filter(s => s.type === 'custom-note').map((s: any) => s.props?.thumbnailUrl).filter(Boolean)
            );

            const checkAndTrashThumbnail = (url: string | undefined) => {
              if (url && url.startsWith('/uploads/') && !usedThumbnails.has(url)) {
                fetch('/api/upload', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url }) }).catch(() => {});
              }
            };

            removedShapes.forEach((shape: any) => {
              if (shape.type === 'custom-note') {
                checkAndTrashThumbnail(shape.props?.thumbnailUrl);
                if (shape.props?.childBoardId) {
                  processBoardResourcesRecursively(shape.props.childBoardId, 'DELETE');
                }
              }
            });

            Object.values(entry.changes.updated).forEach((u: any) => {
              const oldShape = u[0]; const newShape = u[1];
              if (oldShape && newShape && oldShape.type === 'custom-note' && newShape.type === 'custom-note') {
                if (oldShape.props?.thumbnailUrl !== newShape.props?.thumbnailUrl) {
                  checkAndTrashThumbnail(oldShape.props?.thumbnailUrl);
                }
              }
            });

            const fullSnapshot = getSnapshot(editor.store);

            fetch(`/api/board/${boardId}`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ 
                elements: JSON.stringify({ 
                  snapshot: fullSnapshot,
                  locks: { isTitleCaptured: isTitleCapturedRef.current, isImgCaptured: isImgCapturedRef.current }
                }),
                parentBoardId: parentBoardIdRef.current,
                name: boardNameRef.current 
              }),
            });
          }, { scope: 'document', source: 'user' });

          return () => { cleanupSelection(); cleanupDocument(); };
        }}
      />

      <div className="absolute top-1 left-78 z-[1000] bg-white px-4 py-2 rounded-lg shadow-md border border-gray-100 flex items-center gap-3 transition-all">
        <h1 className="text-xs font-semibold text-gray-700 max-w-[200px] truncate" title={boardName}>
          当前页面: {boardName}
        </h1>
        {!isRootBoard && (
          <div className="flex items-center gap-2 border-l pl-2 border-gray-200">
            <button onClick={() => setIsModalOpen(true)} className="text-gray-400 hover:text-blue-500 transition-colors flex items-center" title="修改外观内容"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg></button>
            
            {/* 【核心优化 4：智能返回上一级】如果上一级就是根白板，发送切页请求 */}
            <button onClick={() => { 
              const targetParentId = parentBoardIdRef.current;
              if (targetParentId === 'main_board_001') {
                router.push(`/board/main_board_001?targetPageId=${urlRootPageId || ''}`);
              } else if (targetParentId) {
                router.push(`/board/${targetParentId}?rootPageId=${urlRootPageId || ''}`);
              } else {
                router.push(`/board/main_board_001`);
              }
            }} className="text-gray-400 hover:text-blue-500 transition-colors flex items-center" title="返回上一级便签"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 15l-3-3m0 0l3-3m-3 3h8M3 12a9 9 0 1118 0 9 9 0 01-18 0z" /></svg></button>
            
            {/* 【核心优化 5：Home 键附带目标 Sheet ID】 */}
            <button onClick={() => {
              const targetStr = urlRootPageId ? `?targetPageId=${urlRootPageId}` : '';
              router.push(`/board/main_board_001${targetStr}`);
            }} className="text-gray-400 hover:text-blue-500 transition-colors flex items-center" title="返回根白板"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" /></svg></button>
          </div>
        )}
      </div>

      {selectedNote && (
        <div
          className="absolute top-4 right-4 z-[1000] bg-white p-4 rounded-xl shadow-xl w-60 flex flex-col gap-4 border border-gray-100 select-none animate-in fade-in slide-in-from-top-2 duration-150"
          onPointerDown={e => e.stopPropagation()}
          onClick={e => e.stopPropagation()}
        >
          <div className="text-xs font-bold text-gray-800 border-b pb-1.5 flex justify-between items-center">
            <span>便签样式设置</span>
            <span className="text-[10px] text-gray-400 font-mono">SELECTED</span>
          </div>

          {/* 标题/描述 字号 + 颜色选择器 */}
          <div>
            {/* 选项卡 */}
            <div className="flex gap-1 mb-2 bg-gray-100 rounded-md p-0.5">
              {(['title', 'desc'] as const).map(tab => (
                <button
                  key={tab}
                  onClick={() => setTextEditTab(tab)}
                  className={`flex-1 text-xs py-1 rounded font-medium transition-all ${
                    textEditTab === tab
                      ? 'bg-white text-gray-800 shadow-sm'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  {tab === 'title' ? '标题' : '描述'}
                </button>
              ))}
            </div>

            {/* 字号 S M L XL */}
            <div className="flex gap-1 mb-2">
              {(['s', 'm', 'l', 'xl'] as const).map(size => {
                const activeSize = textEditTab === 'title'
                  ? selectedNote.props.titleSize || 'l'
                  : selectedNote.props.descSize || 'm';
                return (
                  <button
                    key={size}
                    onClick={() => {
                      const prop = textEditTab === 'title' ? 'titleSize' : 'descSize';
                      editorRef.current?.updateShapes([{
                        id: selectedNote.id, type: 'custom-note',
                        props: { [prop]: size }
                      } as any]);
                    }}
                    className={`flex-1 text-xs py-0.5 rounded font-medium transition-all ${
                      activeSize === size
                        ? 'bg-blue-600 text-white shadow-sm'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    {FONT_SIZES[size].label}
                  </button>
                );
              })}
            </div>

            {/* 文字颜色调色盘 */}
            <div className="grid grid-cols-6 gap-1">
              {Object.keys(TEXT_COLORS).map(colorKey => {
                const activeColor = textEditTab === 'title'
                  ? selectedNote.props.titleColor || 'black'
                  : selectedNote.props.descColor || 'grey';
                return (
                  <button
                    key={colorKey}
                    onClick={() => {
                      const prop = textEditTab === 'title' ? 'titleColor' : 'descColor';
                      editorRef.current?.updateShapes([{
                        id: selectedNote.id, type: 'custom-note',
                        props: { [prop]: colorKey }
                      } as any]);
                    }}
                    className={`w-full aspect-square rounded-full border-2 transition-all ${
                      activeColor === colorKey
                        ? 'border-gray-800 scale-110 ring-2 ring-blue-500/20 shadow-sm'
                        : 'border-gray-200 hover:scale-105'
                    }`}
                    style={{ backgroundColor: TEXT_COLORS[colorKey] }}
                    title={colorKey}
                  />
                );
              })}
            </div>
          </div>

          <div>
            <div className="flex justify-between items-center mb-1 text-xs font-medium text-gray-700">
              <span>不透明度</span>
              <span className="text-gray-500">{Math.round((selectedNote.opacity ?? 1) * 100)}%</span>
            </div>
            <input
              type="range" min="10" max="100"
              value={Math.round((selectedNote.opacity ?? 1) * 100)}
              onChange={e => {
                const val = Number(e.target.value) / 100;
                editorRef.current?.updateShapes([{ id: selectedNote.id, type: 'custom-note', opacity: val } as any]);
              }}
              className="w-full h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1.5">便签颜色</label>
            <div className="grid grid-cols-6 gap-1.5">
              {Object.keys(NOTE_COLORS).map(colorKey => (
                <button
                  key={colorKey}
                  onClick={() => {
                    editorRef.current?.updateShapes([{
                      id: selectedNote.id, type: 'custom-note', props: { color: colorKey }
                    } as any]);
                  }}
                  className={`w-6 h-6 rounded-full border transition-all ${selectedNote.props.color === colorKey ? 'border-gray-900 scale-110 ring-2 ring-blue-500/20 shadow-sm' : 'border-gray-200 hover:scale-105'}`}
                  style={{ backgroundColor: NOTE_COLORS[colorKey] }}
                  title={colorKey}
                />
              ))}
            </div>
          </div>

          <label className="flex items-center gap-2 text-xs font-medium text-gray-700 cursor-pointer w-max py-0.5">
            <input
              type="checkbox"
              checked={selectedNote.props.isPinned ?? true}
              onChange={e => {
                editorRef.current?.updateShapes([{
                  id: selectedNote.id, type: 'custom-note', props: { isPinned: e.target.checked }
                } as any]);
              }}
              className="w-4 h-4 text-blue-600 rounded border-gray-300 accent-blue-600"
            />
            显示顶部图钉
          </label>

          <div>
            <div className="flex justify-between items-center mb-1 text-xs font-medium text-gray-700">
              <span>倾斜角度</span>
              <span className="text-gray-500">{Math.round((selectedNote.rotation ?? 0) * 180 / Math.PI)}°</span>
            </div>
            <input
              type="range" min="-15" max="15"
              value={Math.round((selectedNote.rotation ?? 0) * 180 / Math.PI)}
              onPointerDown={() => {
                const shape = editorRef.current?.getShape(selectedNote.id);
                if (shape) setSliderBase({ ...shape });
              }}
              onPointerUp={() => setSliderBase(null)}
              onChange={e => {
                const val = Number(e.target.value);
                const newRot = val * Math.PI / 180;

                const base = sliderBase || editorRef.current?.getShape(selectedNote.id);
                if (!base) return;

                const lx = base.props.w / 2;
                const ly = 15;
                const baseRot = base.rotation || 0;

                const pinWorldX = base.x + lx * Math.cos(baseRot) - ly * Math.sin(baseRot);
                const pinWorldY = base.y + lx * Math.sin(baseRot) + ly * Math.cos(baseRot);

                const newX = pinWorldX - lx * Math.cos(newRot) + ly * Math.sin(newRot);
                const newY = pinWorldY - lx * Math.sin(newRot) - ly * Math.cos(newRot);

                editorRef.current?.updateShapes([{
                  id: selectedNote.id,
                  type: 'custom-note',
                  rotation: newRot,
                  x: newX,
                  y: newY
                } as any]);
              }}
              className="w-full h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
            />
          </div>

          <div>
            <div className="flex justify-between items-center mb-1 text-xs font-medium text-gray-700">
              <span>圆角弧度</span>
              <span className="text-gray-500">{selectedNote.props.borderRadius ?? 4}px</span>
            </div>
            <input
              type="range" min="0" max="32"
              value={selectedNote.props.borderRadius ?? 4}
              onChange={e => {
                const val = Number(e.target.value);
                editorRef.current?.updateShapes([{
                  id: selectedNote.id, type: 'custom-note', props: { borderRadius: val }
                } as any]);
              }}
              className="w-full h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
            />
          </div>

          <div>
            <div className="flex justify-between items-center mb-1 text-xs font-medium text-gray-700">
              <span>层级 (Z-Index)</span>
              <span className="text-gray-500">{selectedNote.props.zIndex ?? 1}</span>
            </div>
            <input
              type="number"
              value={selectedNote.props.zIndex ?? 1}
              onChange={e => {
                const val = Number(e.target.value);
                const editor = editorRef.current;
                if (!editor) return;

                editor.updateShapes([{
                  id: selectedNote.id,
                  type: 'custom-note',
                  props: { zIndex: val }
                } as any]);

                window.requestAnimationFrame(() => {
                  const allNotes = editor.getCurrentPageShapes().filter(s => s.type === 'custom-note') as any[];
                  const sorted = [...allNotes].sort((a, b) => (a.props.zIndex || 0) - (b.props.zIndex || 0));
                  sorted.forEach(n => {
                    editor.bringToFront([n.id]);
                  });
                });
              }}
              className="w-full text-xs px-2.5 py-1.5 border border-gray-200 rounded-lg outline-none focus:border-blue-500 font-mono"
            />
          </div>

          <div className="pt-3 border-t mt-1">
            <button
              onClick={() => {
                if (!editorRef.current) return;
                const parentShape = editorRef.current.getShape(selectedNote.id) as any;
                if (!parentShape) return;

                const bindings = editorRef.current.getBindingsToShape(parentShape.id, 'arrow');
                const outCount = bindings.filter(b => (b.props as any).terminal === 'start').length;

                const childId = createShapeId();
                const arrowId = createShapeId();

                const childX = parentShape.x + parentShape.props.w + 100;
                const childY = parentShape.y + (outCount * 60);

                const colors = Object.keys(NOTE_COLORS);
                const randomColor = colors[Math.floor(Math.random() * colors.length)];

                editorRef.current.createShapes([
                  {
                    id: childId,
                    type: 'custom-note',
                    x: childX,
                    y: childY,
                    props: { color: randomColor, childBoardId: childId.replace('shape:', '') }
                  },
                  {
                    id: arrowId,
                    type: 'arrow',
                    x: parentShape.x,
                    y: parentShape.y,
                    props: {
                      start: { x: 0, y: 0 },
                      end: { x: 100, y: 0 },
                      dash: 'solid',
                      color: 'black',
                      arrowheadEnd: 'arrow',
                      size: 'm'
                    }
                  }
                ]);

                editorRef.current.createBindings([
                  {
                    type: 'arrow',
                    fromId: arrowId,
                    toId: parentShape.id,
                    props: { terminal: 'start', normalizedAnchor: { x: 0.5, y: 0.5 }, isExact: false, isPrecise: false }
                  },
                  {
                    type: 'arrow',
                    fromId: arrowId,
                    toId: childId,
                    props: { terminal: 'end', normalizedAnchor: { x: 0.5, y: 0.5 }, isExact: false, isPrecise: false }
                  }
                ]);

                editorRef.current.select(childId);
              }}
              className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg shadow-sm transition-all text-xs font-bold"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
              一键派生子节点
            </button>
          </div>
        </div>
      )}

      {isModalOpen && (
        <div className="absolute inset-0 z-[2000] flex items-center justify-center bg-black/30 backdrop-blur-sm">
          <div className="bg-white p-6 rounded-xl shadow-xl w-96 flex flex-col gap-4">
            <div className="flex justify-between items-center border-b pb-2">
              <h2 className="text-sm font-bold text-gray-800">设置便签外显属性</h2>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">标签标题</label>
              <input
                type="text" value={noteTitle}
                onChange={e => { setNoteTitle(e.target.value); noteTitleRef.current = e.target.value; }}
                className="w-full text-sm px-3 py-2 border border-gray-300 rounded-md outline-none focus:border-blue-500"
                placeholder="请输入标题..."
                style={{ fontFamily: '"Xiaolai", cursive' }}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">描述内容</label>
              <textarea
                value={noteDescription}
                onChange={e => { setNoteDescription(e.target.value); noteDescriptionRef.current = e.target.value; }}
                className="w-full text-sm px-3 py-2 border border-gray-300 rounded-md outline-none focus:border-blue-500 resize-none"
                placeholder="请输入描述..."
                rows={3}
                style={{ fontFamily: '"Xiaolai", cursive' }}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">封面图片</label>
              <div
                className="w-full h-32 border-2 border-dashed border-gray-300 rounded-md flex items-center justify-center bg-gray-50 bg-cover bg-center cursor-pointer hover:bg-gray-100 transition-colors"
                style={{ backgroundImage: noteImg ? `url(${noteImg})` : 'none' }}
                onClick={() => fileInputRef.current?.click()}
              >
                {!noteImg && <span className="text-xs text-gray-400">点击上传封面图片</span>}
              </div>
              <input type="file" ref={fileInputRef} onChange={handleFileChange} accept="image/*" className="hidden" />
              {noteImg && (
                <button onClick={() => { setNoteImg(''); noteImgRef.current = ''; imgSizeRef.current = null; }} className="mt-2 text-xs text-red-500 hover:underline block text-right w-full">清空图片</button>
              )}
            </div>
            <div className="flex justify-end gap-3 mt-2">
              <button onClick={() => setIsModalOpen(false)} className="px-4 py-1.5 text-xs bg-gray-200 text-gray-700 hover:bg-gray-300 rounded-md transition-colors">取消</button>
              <button onClick={handleSaveMeta} className="px-4 py-1.5 text-xs bg-blue-600 text-white hover:bg-blue-700 rounded-md transition-colors shadow-sm">保存更改</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}