import { HTMLContainer, TLShape, ShapeUtil, T, Rectangle2d, resizeBox, TLResizeInfo, NoteShapeUtil as BuiltInNoteShapeUtil, getDisplayValues } from 'tldraw';

const NOTE_SHAPE_TYPE = 'custom-note';

declare module 'tldraw' {
  export interface TLGlobalShapePropsMap {
    [NOTE_SHAPE_TYPE]: {
      w: number;
      h: number;
      title: string;
      description: string;
      thumbnailUrl: string;
      childBoardId: string;
      color: any;
      isPinned: boolean;
      pinRotation: number;
      borderRadius: number;
      zIndex: number;
      titleSize: string;
      descSize: string;
      titleColor: string;
      descColor: string;
    };
  }
}

export type INoteShape = TLShape<typeof NOTE_SHAPE_TYPE>;

const NOTE_COLORS: Record<string, string> = {
  black: '#e2e8f0', grey: '#f8fafc', 'light-violet': '#e0e7ff', violet: '#c7d2fe',
  blue: '#bfdbfe', 'light-blue': '#bae6fd', yellow: '#fef08a', orange: '#fed7aa',
  green: '#bbf7d0', 'light-green': '#d9f99d', 'light-red': '#fecaca', red: '#fca5a5',
};

// 与官方便签一致的配色，用于标题/描述文字颜色
export const TEXT_COLORS: Record<string, string> = {
  black: '#1e293b', grey: '#6b7280', 'light-violet': '#8b5cf6', violet: '#7c3aed',
  blue: '#3b82f6', 'light-blue': '#0ea5e9', yellow: '#ca8a04', orange: '#ea580c',
  green: '#16a34a', 'light-green': '#22c55e', 'light-red': '#ef4444', red: '#dc2626',
};

// 字号映射 (对应 S/M/L/XL)
export const FONT_SIZES: Record<string, { label: string; title: number; desc: number }> = {
  s:  { label: 'S',  title: 14, desc: 10 },
  m:  { label: 'M',  title: 18, desc: 13 },
  l:  { label: 'L',  title: 22, desc: 16 },
  xl: { label: 'XL', title: 28, desc: 20 },
};

export class NoteShapeUtil extends ShapeUtil<INoteShape> {
  static override type = 'custom-note' as const;

  static override props = {
    w: T.number, h: T.number, title: T.string, description: T.string, thumbnailUrl: T.string,
    childBoardId: T.string, color: T.string as any, isPinned: T.boolean,
    pinRotation: T.number, borderRadius: T.number,
    zIndex: T.number,
    titleSize: T.string as any, descSize: T.string as any,
    titleColor: T.string as any, descColor: T.string as any,
  };

  override getDefaultProps(): INoteShape['props'] {
    const colors: string[] = ['yellow', 'light-red', 'light-blue', 'light-green', 'orange', 'light-violet'];
    return {
      w: 240, h: 240, title: '', description: '', thumbnailUrl: '',
      childBoardId: `board_${Math.random().toString(36).substring(2, 9)}`,
      color: colors[Math.floor(Math.random() * colors.length)],
      isPinned: true, pinRotation: 0, borderRadius: 4,
      zIndex: 1,
      titleSize: 'l', descSize: 'm', titleColor: 'black', descColor: 'grey',
    };
  }

  override getGeometry(shape: INoteShape) {
    return new Rectangle2d({ width: shape.props.w, height: shape.props.h, isFilled: true });
  }

  override onResize(shape: INoteShape, info: TLResizeInfo<INoteShape>) {
    return resizeBox(shape, info);
  }

  override canEdit() { return true; }

  override canResize() { return true; }

  override onDoubleClick(shape: INoteShape) {
    window.dispatchEvent(new CustomEvent('tldraw-enter-board', { detail: shape.props.childBoardId }));
  }

  override component(shape: INoteShape) {
    const hasImg = !!shape.props.thumbnailUrl && !shape.props.thumbnailUrl.includes('via.placeholder.com');
    const hasDesc = !!shape.props.description;
    const hasTitle = !!shape.props.title;
    const bgColor = NOTE_COLORS[shape.props.color as any] || '#fef08a';
    const titleSize = FONT_SIZES[shape.props.titleSize] || FONT_SIZES.l;
    const descSize = FONT_SIZES[shape.props.descSize] || FONT_SIZES.m;
    const titleColor = TEXT_COLORS[shape.props.titleColor] || TEXT_COLORS.black;
    const descColor = TEXT_COLORS[shape.props.descColor] || TEXT_COLORS.grey;

    // 标题 + 描述作为一个紧贴整体
    const textGroup = (hasTitle || hasDesc) && (
      <div style={{
        flex: 'none',
        display: 'flex', flexDirection: 'column', alignItems: 'center',
      }}>
        {hasTitle && (
          <div style={{
            fontWeight: '600', color: titleColor, textAlign: 'center',
            fontSize: `${titleSize.title}px`,
            padding: hasDesc ? '0 0 4px 0' : '0',
            fontFamily: '"Xiaolai", sans-serif',
            maxWidth: '100%',
          }}>
            <span style={{
              display: '-webkit-box', WebkitLineClamp: 1, WebkitBoxOrient: 'vertical',
              overflow: 'hidden', wordBreak: 'break-all',
            }}>
               {shape.props.title}
            </span>
          </div>
        )}
        {hasDesc && (
          <div style={{
            textAlign: 'left',
            alignSelf: 'stretch',
            fontSize: `${descSize.desc}px`,
            color: descColor,
            lineHeight: '1.5',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            overflowWrap: 'break-word',
            fontFamily: '"Xiaolai", sans-serif',
          }}>
            {shape.props.description}
          </div>
        )}
      </div>
    );

    return (
      <HTMLContainer id={shape.id} style={{ pointerEvents: 'all', overflow: 'visible' }}>
        <div style={{
          width: '100%', height: '100%',
          backgroundColor: bgColor, borderRadius: `${shape.props.borderRadius}px`,
          padding: '12px', display: 'flex', flexDirection: 'column', position: 'relative',
          boxShadow: '0 6px 10px -5px rgba(0, 0, 0, 0.5)',
          zIndex: shape.props.zIndex,
          justifyContent: !hasImg && hasDesc ? 'center' : undefined,
        }}>
          {shape.props.isPinned && (
             <div style={{ position: 'absolute', top: '8px', left: '50%', transform: 'translateX(-50%)', width: '14px', height: '14px', borderRadius: '50%', background: 'radial-gradient(circle at 35% 35%, #ef4444, #991b1b)', boxShadow: '0 3px 5px rgba(0,0,0,0.4)', zIndex: 10 }}>
                <div style={{ position: 'absolute', top: '12px', left: '6px', width: '2px', height: '8px', background: '#64748b', zIndex: -1 }} />
             </div>
          )}

          {hasImg && (
            <div style={{
              flex: 1, position: 'relative', overflow: 'hidden',
              borderRadius: '4px',
              border: '1px solid rgba(0, 0, 0, 0.05)',
              marginTop: shape.props.isPinned ? '12px' : '0', marginBottom: '8px',
            }}>
               <div style={{
                  position: 'absolute', inset: 0,
                  backgroundImage: `url(${shape.props.thumbnailUrl})`,
                  backgroundSize: 'cover', backgroundPosition: 'center'
               }} />
            </div>
          )}

          {/* 有描述: 标题+描述整体; 无描述无封面: 标题居中撑满; 无描述有封面: 标题紧贴封面下方 */}
          {hasDesc ? textGroup : (
            <div style={{
              flex: hasImg ? 'none' : '1',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              height: hasImg ? 'auto' : undefined,
            }}>
              {hasTitle && (
                <span style={{
                  display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                  overflow: 'hidden', fontWeight: '600', color: titleColor,
                  fontSize: `${titleSize.title}px`, textAlign: 'center',
                  fontFamily: '"Xiaolai", sans-serif'
                }}>
                   {shape.props.title}
                </span>
              )}
            </div>
          )}
        </div>
      </HTMLContainer>
    );
  }

  override getIndicatorPath(shape: INoteShape) {
    const path = new Path2D();
    path.roundRect(0, 0, shape.props.w, shape.props.h, shape.props.borderRadius);
    return path;
  }
}

// 修复 tldraw 内置 note 形状：
// 1. 显示大小调整手柄（替代原版 clone 快捷复制手柄）
// 2. 长宽不锁定等比例，自由缩放
// 3. 缩放时文字保持原大小，随宽度自动重排换行
export class FixedBuiltInNoteUtil extends BuiltInNoteShapeUtil {
  static override type = 'note' as const;

  constructor(editor: any) {
    super(editor);
    // 包装 getDefaultDisplayValues，使其从 shape.meta 读取自定义宽高
    const origFn = this.options.getDefaultDisplayValues.bind(this);
    this.options.getDefaultDisplayValues = (ed: any, shape: any, theme: any, cm: any) => {
      const dv = origFn(ed, shape, theme, cm);
      const meta = (shape as any).meta || {};
      if (meta.noteWidth) dv.noteWidth = meta.noteWidth;
      if (meta.noteHeight) dv.noteHeight = meta.noteHeight;
      return dv;
    };
  }

  // 始终显示四角缩放手柄（原版 resizeMode="none" 会隐藏）
  override hideResizeHandles(_shape: any) { return false; }

  // 移除快捷复制手柄（原版在选中时显示 clone 按钮）
  override getHandles(_shape: any) { return []; }

  // 允许长宽自由缩放（不锁定等比例）
  override isAspectRatioLocked(_shape: any) { return false; }

  // 自定义缩放：把宽高存入 meta，scale 恒为 1（避免文字被 CSS scale 缩放）
  override onResize(shape: any, info: any) {
    const { initialShape, scaleX, scaleY } = info;
    const initMeta = initialShape.meta || {};
    const baseW = initMeta.noteWidth || 200;
    const baseH = initMeta.noteHeight || 200;

    let newShape = {
      ...shape,
      props: { ...shape.props, scale: 1 },
      meta: {
        ...shape.meta,
        noteWidth: Math.max(50, baseW * scaleX),
        noteHeight: Math.max(50, baseH * scaleY),
      },
    };

    // 根据新宽度重新计算文字布局（换行 → growY），保证不缩字号
    return this.computeNoteSizeAdjustments(newShape) ?? newShape;
  }

  override onBeforeCreate(next: any) {
    return this.computeNoteSizeAdjustments(next);
  }

  override onBeforeUpdate(prev: any, next: any) {
    const result = super.onBeforeUpdate(prev, next);
    if (result === undefined) return undefined;
    return this.computeNoteSizeAdjustments(result) ?? result;
  }

  // 父类 getNoteSizeAdjustments 是 private 类字段，无法 super 调用；在此独立实现
  private computeNoteSizeAdjustments(shape: any) {
    const dv = getDisplayValues(this, shape);
    const fontSizeAdjustment = 1;

    const text = this.getText(shape);
    let labelHeight: number;
    if (!text) {
      labelHeight = dv.labelFontSize * dv.labelLineHeight + dv.labelPadding * 2;
    } else {
      try {
        const measured = this.editor.textMeasure.measureText(text, {
          fontFamily: dv.labelFontFamily,
          fontSize: dv.labelFontSize,
          lineHeight: dv.labelLineHeight,
          maxWidth: dv.noteWidth - dv.labelPadding * 2 - 1,
          fontWeight: 'normal',
          fontStyle: 'normal',
          fontVariant: 'normal',
        } as any);
        labelHeight = (measured.h || 0) + dv.labelPadding * 2;
      } catch {
        labelHeight = dv.noteHeight;
      }
    }

    const growY = Math.max(0, labelHeight - dv.noteHeight);
    if (growY !== shape.props.growY || fontSizeAdjustment !== shape.props.fontSizeAdjustment) {
      return {
        ...shape,
        props: {
          ...shape.props,
          growY,
          fontSizeAdjustment,
        },
      };
    }
    return undefined;
  }
}
