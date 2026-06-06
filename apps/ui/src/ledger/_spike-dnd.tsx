/**
 * Plan 182 — DnD framework spike (scratch artifact, do not delete)
 *
 * Questions answered:
 *   1. Library choice
 *   2. Adapter shape that keeps @dnd-kit types out of call sites
 *   3. Wiring pattern to TCA send()
 *
 * Run: pnpm --filter @arbor/ui dev, then import SpikeDemoPage somewhere
 */

import React, { useCallback } from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  horizontalListSortingStrategy,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useStore } from '@arbor/common/react';
import { Effect, type Reducer } from '@arbor/common';

// ─── Adapter ─────────────────────────────────────────────────────────────────
//
// Only this file imports from @dnd-kit. Everything it exports uses plain React
// and generic TypeScript types so call sites stay library-agnostic.

export interface DragItemProps {
  ref: (node: HTMLElement | null) => void;
  style: React.CSSProperties;
  isDragging: boolean;
  /** Spread onto the drag-handle element: pointer/keyboard listeners + aria attrs */
  handleProps: Record<string, unknown>;
}

/**
 * Per-item hook. Must be called inside a <DndSortWrapper> subtree.
 * Returns MUI-compatible props; no @dnd-kit type appears at the call site.
 */
export function useDndItem(id: string | number): DragItemProps {
  const {
    setNodeRef,
    transform,
    transition,
    isDragging,
    listeners,
    attributes,
  } = useSortable({ id });

  return {
    ref: setNodeRef,
    style: {
      transform: CSS.Transform.toString(transform),
      transition,
      opacity: isDragging ? 0.4 : 1,
      cursor: isDragging ? 'grabbing' : 'grab',
    },
    isDragging,
    handleProps: { ...listeners, ...attributes },
  };
}

type SortDirection = 'horizontal' | 'vertical';

interface DndSortWrapperProps<K extends string | number> {
  /** Ordered IDs from the store — adapter is stateless, caller owns truth */
  ids: readonly K[];
  onReorder: (fromId: K, toId: K) => void;
  direction?: SortDirection;
  children: React.ReactNode;
}

/**
 * Wraps children with DnD context. Stateless: caller owns the ordered list and
 * must handle onReorder to keep it current between renders.
 *
 * Design note: no local sortedIds state. During drag, @dnd-kit handles visual
 * position via CSS transforms on each item; the store is updated atomically on
 * drop. If intermediate order state is needed (e.g. animated list reorder), add
 * a `dragging` field to the store reducer rather than duplicating state here.
 */
export function DndSortWrapper<K extends string | number>({
  ids,
  onReorder,
  direction = 'horizontal',
  children,
}: DndSortWrapperProps<K>): React.ReactElement {
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (over && active.id !== over.id) {
        onReorder(active.id as K, over.id as K);
      }
    },
    [onReorder],
  );

  const strategy =
    direction === 'horizontal' ? horizontalListSortingStrategy : verticalListSortingStrategy;

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={ids as unknown as (string | number)[]} strategy={strategy}>
        {children}
      </SortableContext>
    </DndContext>
  );
}

// ─── Demo ─────────────────────────────────────────────────────────────────────
//
// Simulates a store that holds columnOrder and responds to reorderColumn action.
// Shows the exact wiring pattern plan 183 will use.

type ColId = 'id' | 'title' | 'status' | 'wave' | 'size';

interface DemoState {
  columnOrder: ColId[];
}

type DemoAction =
  | { tag: 'reorderColumn'; fromId: ColId; toId: ColId };

type DemoEnv = Record<string, never>;

const demoReducer: Reducer<DemoState, DemoAction, DemoEnv> = ($, action) => {
  const from = $.state.columnOrder.indexOf(action.fromId);
  const to = $.state.columnOrder.indexOf(action.toId);
  if (from !== -1 && to !== -1) {
    $.state.columnOrder = [...arrayMove($.state.columnOrder, from, to)];
  }
  return Effect.none();
};

const LABELS: Record<ColId, string> = {
  id: '#',
  title: 'Title',
  status: 'Status',
  wave: 'Wave',
  size: 'Size',
};

function SortableColHeader({ id }: { id: ColId }) {
  const { ref, style, handleProps } = useDndItem(id);
  return (
    <th
      ref={ref}
      style={{
        ...style,
        padding: '8px 16px',
        border: '1px solid #ccc',
        background: '#f5f5f5',
        userSelect: 'none',
        minWidth: 80,
      }}
      {...handleProps}
    >
      {LABELS[id]} ↔
    </th>
  );
}

export function SpikeDemoPage(): React.ReactElement {
  const [$, send] = useStore(
    demoReducer,
    {},
    { columnOrder: ['id', 'title', 'status', 'wave', 'size'] satisfies ColId[] },
  );

  return (
    <div style={{ padding: 24, fontFamily: 'monospace' }}>
      <h2>Plan 182 — DnD Sort Spike</h2>
      <p>Drag column headers to reorder. The store owns the order.</p>
      <DndSortWrapper<ColId>
        ids={$.state.columnOrder}
        onReorder={(fromId, toId) => { send({ tag: 'reorderColumn', fromId, toId }); }}
        direction="horizontal"
      >
        <table style={{ borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              {$.state.columnOrder.map((id) => (
                <SortableColHeader key={id} id={id} />
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              {$.state.columnOrder.map((id) => (
                <td key={id} style={{ padding: '8px 16px', border: '1px solid #eee' }}>
                  {id}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </DndSortWrapper>
      <pre style={{ marginTop: 16, fontSize: 12 }}>
        columnOrder: {JSON.stringify($.state.columnOrder)}
      </pre>
    </div>
  );
}
