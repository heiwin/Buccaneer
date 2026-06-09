import React from 'react';
import { Modal } from './Modal';
import { Button } from './Button';
import { AlertTriangle, Info, AlertCircle } from 'lucide-react';

type DialogKind = 'info' | 'warning' | 'danger';

interface ConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  kind?: DialogKind;
  loading?: boolean;
}

const kindConfig: Record<DialogKind, {
  icon: React.ElementType;
  iconBg: string;
  iconColor: string;
  confirmVariant: 'primary' | 'danger';
}> = {
  info: {
    icon: Info,
    iconBg: 'bg-primary/10',
    iconColor: 'text-primary',
    confirmVariant: 'primary',
  },
  warning: {
    icon: AlertTriangle,
    iconBg: 'bg-amber-500/10',
    iconColor: 'text-amber-400',
    confirmVariant: 'primary',
  },
  danger: {
    icon: AlertCircle,
    iconBg: 'bg-rose-500/10',
    iconColor: 'text-rose-400',
    confirmVariant: 'danger',
  },
};

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title = 'Confirm',
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  kind = 'info',
  loading = false,
}) => {
  const config = kindConfig[kind];
  const IconComponent = config.icon;

  return (
    <Modal isOpen={isOpen} onClose={onClose} maxWidth="sm">
      <div className="flex flex-col items-center text-center pt-4 pb-2">
        {/* Icon */}
        <div className={`w-16 h-16 rounded-2xl ${config.iconBg} flex items-center justify-center mb-6`}>
          <IconComponent className={`w-8 h-8 ${config.iconColor}`} />
        </div>

        {/* Title */}
        <h3 className="text-xl font-bold text-gray-100 mb-3">{title}</h3>

        {/* Message */}
        <p className="text-sm text-zinc-400 leading-relaxed mb-8 max-w-xs">{message}</p>

        {/* Buttons */}
        <div className="flex gap-3 w-full">
          <Button
            variant="ghost"
            className="flex-1"
            onClick={onClose}
            disabled={loading}
          >
            {cancelLabel}
          </Button>
          <Button
            variant={config.confirmVariant}
            className="flex-1"
            onClick={() => {
              onConfirm();
              onClose();
            }}
            disabled={loading}
          >
            {loading ? 'Processing…' : confirmLabel}
          </Button>
        </div>
      </div>
    </Modal>
  );
};
