'use client';

import { ReactNode } from 'react';
import { GripVertical, Settings, Trash2 } from 'lucide-react';

interface WidgetCardProps {
  title?: string;
  children: ReactNode;
  onDelete?: () => void;
  onSettings?: () => void;
  isDragging?: boolean;
  showDragHandle?: boolean;
  actions?: ReactNode;
}

export function WidgetCard({
  title,
  children,
  onDelete,
  onSettings,
  isDragging,
  showDragHandle = true,
  actions
}: WidgetCardProps) {
  return (
    <div className={`card h-full flex flex-col ${isDragging ? 'opacity-50' : ''}`}>
      {(title || showDragHandle || onDelete || onSettings || actions) && (
        <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100">
          <div className="flex items-center gap-2">
            {showDragHandle && (
              <div className="cursor-grab active:cursor-grabbing text-gray-400 hover:text-gray-600">
                <GripVertical className="w-4 h-4" />
              </div>
            )}
            {title && <h3 className="font-medium text-gray-800 text-sm">{title}</h3>}
          </div>
          
          <div className="flex items-center gap-1">
            {actions}
            {onSettings && (
              <button onClick={onSettings} className="p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded transition-colors">
                <Settings className="w-4 h-4" />
              </button>
            )}
            {onDelete && (
              <button onClick={onDelete} className="p-1 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors">
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      )}
      
      <div className="flex-1 p-3 overflow-hidden">
        {children}
      </div>
    </div>
  );
}
