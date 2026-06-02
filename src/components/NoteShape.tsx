import { HTMLContainer, TLShape, ShapeUtil, T, Rectangle2d, resizeBox, TLResizeInfo } from 'tldraw';

const NOTE_SHAPE_TYPE = 'custom-note';

declare module 'tldraw' {
  export interface TLGlobalShapePropsMap {
    [NOTE_SHAPE_TYPE]: {
      w: number;
      h: number;
      title: string;
      thumbnailUrl: string;
      childBoardId: string;
      color: any;
      isPinned: boolean;
      pinRotation: number;
      borderRadius: number;
      zIndex: number; // 【新增】：层级数据字段
    };
  }
}

export type INoteShape = TLShape<typeof NOTE_SHAPE_TYPE>;

const NOTE_COLORS: Record<string, string> = {
  black: '#e2e8f0', grey: '#f8fafc', 'light-violet': '#e0e7ff', violet: '#c7d2fe',
  blue: '#bfdbfe', 'light-blue': '#bae6fd', yellow: '#fef08a', orange: '#fed7aa',
  green: '#bbf7d0', 'light-green': '#d9f99d', 'light-red': '#fecaca', red: '#fca5a5',
};

export class NoteShapeUtil extends ShapeUtil<INoteShape> {
  static override type = 'custom-note' as const;

  static override props = {
    w: T.number, h: T.number, title: T.string, thumbnailUrl: T.string,
    childBoardId: T.string, color: T.string as any, isPinned: T.boolean,
    pinRotation: T.number, borderRadius: T.number,
    zIndex: T.number, // 【新增】
  };

  override getDefaultProps(): INoteShape['props'] {
    const colors: string[] = ['yellow', 'light-red', 'light-blue', 'light-green', 'orange', 'light-violet'];
    return {
      w: 240, h: 240, title: '', thumbnailUrl: '',
      childBoardId: `board_${Math.random().toString(36).substring(2, 9)}`,
      color: colors[Math.floor(Math.random() * colors.length)],
      isPinned: true, pinRotation: 0, borderRadius: 4,
      zIndex: 1, // 【新增】：默认层级为 1
    };
  }

  override getGeometry(shape: INoteShape) {
    return new Rectangle2d({ width: shape.props.w, height: shape.props.h, isFilled: true });
  }

  override onResize(shape: INoteShape, info: TLResizeInfo<INoteShape>) {
    return resizeBox(shape, info);
  }

  override canEdit() { return true; }

  override onDoubleClick(shape: INoteShape) {
    window.dispatchEvent(new CustomEvent('tldraw-enter-board', { detail: shape.props.childBoardId }));
  }

  override component(shape: INoteShape) {
    const hasImg = !!shape.props.thumbnailUrl && !shape.props.thumbnailUrl.includes('via.placeholder.com');
    const bgColor = NOTE_COLORS[shape.props.color as any] || '#fef08a';

    return (
      <HTMLContainer id={shape.id} style={{ pointerEvents: 'all', overflow: 'visible' }}>
        <div style={{
          width: '100%', height: '100%',
          backgroundColor: bgColor, borderRadius: `${shape.props.borderRadius}px`,
          padding: '12px', display: 'flex', flexDirection: 'column', position: 'relative',
          boxShadow: '0 6px 10px -5px rgba(0, 0, 0, 0.5)',
          zIndex: shape.props.zIndex // 【新增】：内部样式双保险
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
              marginTop: shape.props.isPinned ? '12px' : '0', marginBottom: '8px'
            }}>
               <div style={{
                  position: 'absolute', inset: 0, 
                  backgroundImage: `url(${shape.props.thumbnailUrl})`, 
                  backgroundSize: 'cover', backgroundPosition: 'center' 
               }} />
            </div>
          )}
          
          <div style={{ 
            flex: 'none', height: hasImg ? 'auto' : '100%',
            display: 'flex', alignItems: 'center', justifyContent: 'center', 
            fontWeight: '600', color: '#1e293b', textAlign: 'center',
            fontSize: hasImg ? '14px' : '16px',
            maxHeight: hasImg ? '40px' : 'none', overflow: 'hidden',
           // 【统一配置】：直接使用 Tldraw 的原生变量，这样整个画板的字体都统一了
            fontFamily: '"Xiaolai", sans-serif'
          }}>
            <span style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
               {shape.props.title}
            </span>
          </div>
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