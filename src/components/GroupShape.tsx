import { HTMLContainer, TLShape, BaseBoxShapeUtil, T, Rectangle2d, resizeBox, TLResizeInfo, BaseBoxShapeTool } from 'tldraw';

const GROUP_SHAPE_TYPE = 'group-rect';

declare module 'tldraw' {
  export interface TLGlobalShapePropsMap {
    [GROUP_SHAPE_TYPE]: {
      w: number;
      h: number;
      color: string;
    };
  }
}

export type IGroupShape = TLShape<typeof GROUP_SHAPE_TYPE>;

// 与便签共用配色
export const GROUP_COLORS: Record<string, string> = {
  black: '#e2e8f0', grey: '#f8fafc', 'light-violet': '#e0e7ff', violet: '#c7d2fe',
  blue: '#bfdbfe', 'light-blue': '#bae6fd', yellow: '#fef08a', orange: '#fed7aa',
  green: '#bbf7d0', 'light-green': '#d9f99d', 'light-red': '#fecaca', red: '#fca5a5',
};

export class GroupShapeUtil extends BaseBoxShapeUtil<IGroupShape> {
  static override type = 'group-rect' as const;

  static override props = {
    w: T.number,
    h: T.number,
    color: T.string,
  };

  // 缩放期间暂存子元素原始尺寸（避免子元素跟随缩放）
  private _resizeChildSizes: Map<string, { w: number; h: number }> = new Map();

  override getDefaultProps(): IGroupShape['props'] {
    const colors = Object.keys(GROUP_COLORS);
    return {
      w: 300,
      h: 200,
      color: colors[Math.floor(Math.random() * colors.length)],
    };
  }

  override getGeometry(shape: IGroupShape) {
    return new Rectangle2d({ width: shape.props.w, height: shape.props.h, isFilled: true });
  }

  override canResize() { return true; }
  override canResizeChildren(_shape: IGroupShape) { return false; }
  override isAspectRatioLocked(_shape: IGroupShape) { return false; }
  override canEdit() { return false; }
  override hideRotateHandle(_shape: IGroupShape) { return true; }

  // 缩放开始：记录所有子元素的原始宽高
  override onResizeStart(shape: IGroupShape) {
    this._resizeChildSizes.clear();
    const children = (this as any).editor.getSortedChildIdsForParent(shape.id);
    for (const childId of children) {
      const child = (this as any).editor.getShape(childId);
      if (child && 'props' in child && (child.props as any).w !== undefined) {
        this._resizeChildSizes.set(childId, {
          w: (child.props as any).w,
          h: (child.props as any).h,
        });
      }
    }
    return shape;
  }

  override onResize(shape: IGroupShape, info: TLResizeInfo<IGroupShape>) {
    return resizeBox(shape, info);
  }

  // 缩放结束：恢复子元素原始大小 + 标记隶属关系刷新
  override onResizeEnd(initial: IGroupShape, current: IGroupShape) {
    // 还原子元素宽高（保持绝对大小不变）
    if (this._resizeChildSizes.size > 0) {
      const editor = (this as any).editor;
      const updates: any[] = [];
      for (const [childId, size] of this._resizeChildSizes) {
        const child = editor.getShape(childId);
        if (child && 'props' in child) {
          const cp = (child.props as any);
          if (cp.w !== size.w || cp.h !== size.h) {
            updates.push({ id: childId, type: child.type, props: { w: size.w, h: size.h } });
          }
        }
      }
      if (updates.length > 0) {
        editor.updateShapes(updates);
      }
      this._resizeChildSizes.clear();
    }

    return {
      ...current,
      meta: { ...(current as any).meta, needsMembershipCheck: true },
    };
  }

  override component(shape: IGroupShape) {
    const baseColor = GROUP_COLORS[shape.props.color] || '#fef08a';
    // 将 hex 转成带透明度的 rgba，避免 CSS opacity 创建层叠上下文导致文字白边
    const r = parseInt(baseColor.slice(1, 3), 16);
    const g = parseInt(baseColor.slice(3, 5), 16);
    const b = parseInt(baseColor.slice(5, 7), 16);
    const bgColor = `rgba(${r}, ${g}, ${b}, 0.82)`;

    return (
      <HTMLContainer id={shape.id} style={{ pointerEvents: 'all', overflow: 'visible' }}>
        <div style={{
          width: '100%', height: '100%',
          backgroundColor: bgColor,
          borderRadius: '8px',
          boxShadow: '0 6px 10px -5px rgba(0, 0, 0, 0.5)',
          border: '1px solid rgba(0, 0, 0, 0.08)',
        }} />
      </HTMLContainer>
    );
  }

  override getIndicatorPath(shape: IGroupShape) {
    const path = new Path2D();
    path.roundRect(0, 0, shape.props.w, shape.props.h, 8);
    return path;
  }
}

// 计算形状的页面坐标中心点
export function getShapePageCenter(editor: any, shape: TLShape): { x: number; y: number } {
  const bounds = editor.getShapePageBounds(shape.id);
  if (bounds) {
    return { x: bounds.x + bounds.w / 2, y: bounds.y + bounds.h / 2 };
  }
  // fallback: 用 shape 自身的 x/y 加上半宽高估算（没有旋转时等效）
  const s = shape as any;
  return { x: s.x + (s.props.w || 0) / 2, y: s.y + (s.props.h || 0) / 2 };
}

// 查找包含指定形状中心点的最小面积组
export function findContainingGroup(
  editor: any,
  shape: TLShape,
  groups: TLShape[]
): TLShape | null {
  if (groups.length === 0) return null;
  const center = getShapePageCenter(editor, shape);
  let best: TLShape | null = null;
  let bestArea = Infinity;

  for (const g of groups) {
    if (g.id === shape.id) continue;
    const gb = editor.getShapePageBounds(g.id);
    if (!gb) continue;
    if (center.x >= gb.x && center.x <= gb.x + gb.w &&
        center.y >= gb.y && center.y <= gb.y + gb.h) {
      const area = gb.w * gb.h;
      if (area < bestArea) {
        bestArea = area;
        best = g;
      }
    }
  }
  return best;
}

// 工具：点击拖拽画矩形创建组
export class GroupTool extends BaseBoxShapeTool {
  static override id = 'group-rect';
  override shapeType = 'group-rect' as const;

  override onCreate(shape: TLShape | null): void {
    if (!shape) return;
    const editor = (this as any).editor;
    // 将组送到最底层
    editor.sendToBack([shape.id]);

    // 初始隶属判定：遍历当前页所有非组 shape
    setTimeout(() => {
      try {
        const allShapes = editor.getCurrentPageShapes();
        const groups = allShapes.filter((s: TLShape) => s.type === GROUP_SHAPE_TYPE);
        const nonGroups = allShapes.filter((s: TLShape) => s.type !== GROUP_SHAPE_TYPE);

        for (const s of nonGroups) {
          const group = findContainingGroup(editor, s, groups);
          if (group) {
            (editor as any).reparentShapes([s.id], group.id);
          }
        }
      } catch { /* ignore */ }
    }, 50);
  }
}
