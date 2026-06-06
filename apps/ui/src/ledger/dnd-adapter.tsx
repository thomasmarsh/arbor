import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  horizontalListSortingStrategy,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import React, { useCallback } from 'react';

export interface DragItemProps {
  ref: (node: HTMLElement | null) => void;
  style: React.CSSProperties;
  isDragging: boolean;
  handleProps: Record<string, unknown>;
}

export function useDndItem(id: string | number): DragItemProps {
  const { setNodeRef, transform, transition, isDragging, listeners, attributes } = useSortable({
    id,
  });
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

interface DndSortWrapperProps<K extends string | number> {
  ids: readonly K[];
  onReorder: (fromId: K, toId: K) => void;
  direction?: 'horizontal' | 'vertical';
  children: React.ReactNode;
}

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
