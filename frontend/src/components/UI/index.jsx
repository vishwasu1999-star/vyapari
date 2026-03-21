import React from 'react';
import { X, Loader2, AlertTriangle, Info } from 'lucide-react';
import { classNames, statusBadge } from '../../utils/helpers';

// ============================================================
// BUTTON
// ============================================================
export const Button = ({
  children, variant = 'primary', size = 'md', icon: Icon,
  iconRight: IconR, loading, className, ...props
}) => {
  const sizes = { sm: 'px-3 py-1.5 text-xs', md: 'px-4 py-2 text-sm', lg: 'px-5 py-2.5 text-base' };
  const vars  = {
    primary: 'bg-brand-600 text-white hover:bg-brand-500 focus:ring-brand-500',
    ghost:   'bg-transparent text-slate-300 hover:bg-surface-700 focus:ring-slate-600',
    danger:  'bg-red-600 text-white hover:bg-red-500 focus:ring-red-500',
    outline: 'border border-slate-600 text-slate-300 hover:bg-surface-700 focus:ring-slate-600',
    success: 'bg-emerald-600 text-white hover:bg-emerald-500 focus:ring-emerald-500',
  };

  return (
    <button
      className={classNames(
        'inline-flex items-center justify-center gap-2 rounded-lg font-semibold',
        'transition-all duration-150 cursor-pointer',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        'focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-offset-surface-900',
        sizes[size], vars[variant] || vars.primary, className
      )}
      {...props}
    >
      {loading ? <Loader2 size={14} className="animate-spin" /> : Icon && <Icon size={14} />}
      {children}
      {IconR && !loading && <IconR size={14} />}
    </button>
  );
};

// ============================================================
// INPUT
// ============================================================
export const Input = React.forwardRef(({
  label, error, helper, prefix, suffix, className, ...props
}, ref) => (
  <div className={classNames('flex flex-col gap-1', className)}>
    {label && <label className="text-xs font-medium text-slate-400">{label}</label>}
    <div className="relative flex items-center">
      {prefix && <span className="absolute left-3 text-slate-500 text-sm select-none">{prefix}</span>}
      <input
        ref={ref}
        className={classNames(
          'w-full bg-surface-900 border rounded-lg px-3 py-2',
          'text-sm text-slate-100 placeholder-slate-600',
          'focus:outline-none focus:ring-2 focus:border-transparent transition-all',
          error ? 'border-red-500 focus:ring-red-500' : 'border-surface-700 focus:ring-brand-500',
          prefix && 'pl-8',
          suffix && 'pr-8',
        )}
        {...props}
      />
      {suffix && <span className="absolute right-3 text-slate-500 text-sm select-none">{suffix}</span>}
    </div>
    {error  && <p className="text-xs text-red-400">{error}</p>}
    {helper && <p className="text-xs text-slate-500">{helper}</p>}
  </div>
));
Input.displayName = 'Input';

// ============================================================
// SELECT
// ============================================================
export const Select = React.forwardRef(({ label, error, children, className, ...props }, ref) => (
  <div className={classNames('flex flex-col gap-1', className)}>
    {label && <label className="text-xs font-medium text-slate-400">{label}</label>}
    <select
      ref={ref}
      className={classNames(
        'w-full bg-surface-900 border rounded-lg px-3 py-2',
        'text-sm text-slate-100 focus:outline-none focus:ring-2 focus:border-transparent transition-all',
        error ? 'border-red-500 focus:ring-red-500' : 'border-surface-700 focus:ring-brand-500',
      )}
      {...props}
    >
      {children}
    </select>
    {error && <p className="text-xs text-red-400">{error}</p>}
  </div>
));
Select.displayName = 'Select';

// ============================================================
// TEXTAREA
// ============================================================
export const Textarea = React.forwardRef(({ label, error, className, ...props }, ref) => (
  <div className={classNames('flex flex-col gap-1', className)}>
    {label && <label className="text-xs font-medium text-slate-400">{label}</label>}
    <textarea
      ref={ref}
      rows={3}
      className={classNames(
        'w-full bg-surface-900 border rounded-lg px-3 py-2 resize-none',
        'text-sm text-slate-100 placeholder-slate-600',
        'focus:outline-none focus:ring-2 focus:border-transparent transition-all',
        error ? 'border-red-500 focus:ring-red-500' : 'border-surface-700 focus:ring-brand-500',
        className
      )}
      {...props}
    />
    {error && <p className="text-xs text-red-400">{error}</p>}
  </div>
));
Textarea.displayName = 'Textarea';

// ============================================================
// MODAL
// ============================================================
export const Modal = ({ open, onClose, title, children, size = 'md', footer }) => {
  if (!open) return null;
  const sizes = { sm: 'max-w-sm', md: 'max-w-lg', lg: 'max-w-2xl', xl: 'max-w-4xl', full: 'max-w-6xl' };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 animate-fade-in">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className={classNames(
        'relative bg-surface-800 w-full rounded-t-2xl sm:rounded-2xl',
        'border border-surface-700 shadow-2xl animate-slide-up',
        'max-h-[95dvh] flex flex-col',
        sizes[size]
      )}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-surface-700 flex-shrink-0">
          <h2 className="text-base font-semibold text-slate-100">{title}</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-surface-700 text-slate-400 hover:text-slate-200 transition-colors">
            <X size={16} />
          </button>
        </div>
        {/* Body */}
        <div className="overflow-y-auto flex-1 px-5 py-4">{children}</div>
        {/* Footer */}
        {footer && (
          <div className="px-5 py-4 border-t border-surface-700 flex items-center justify-end gap-3 flex-shrink-0">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
};

// ============================================================
// STAT CARD
// ============================================================
export const StatCard = ({ label, value, sub, icon: Icon, color = 'brand', trend }) => {
  const colors = {
    brand:  { icon: 'text-emerald-400 bg-emerald-900/30', value: 'text-emerald-400' },
    blue:   { icon: 'text-blue-400 bg-blue-900/30',       value: 'text-blue-400' },
    amber:  { icon: 'text-amber-400 bg-amber-900/30',     value: 'text-amber-400' },
    red:    { icon: 'text-red-400 bg-red-900/30',         value: 'text-red-400' },
    slate:  { icon: 'text-slate-400 bg-slate-700/30',     value: 'text-slate-200' },
  };
  const c = colors[color] || colors.brand;

  return (
    <div className="card p-4 hover:border-surface-600 transition-all duration-200">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium text-slate-500 mb-1">{label}</p>
          <p className={classNames('text-xl font-bold font-mono', c.value)}>{value}</p>
          {sub && <p className="text-xs text-slate-500 mt-0.5">{sub}</p>}
        </div>
        {Icon && (
          <div className={classNames('p-2 rounded-lg', c.icon)}>
            <Icon size={18} />
          </div>
        )}
      </div>
    </div>
  );
};

// ============================================================
// BADGE
// ============================================================
export const StatusBadge = ({ status }) => {
  const { class: cls, label } = statusBadge(status);
  return <span className={cls}>{label}</span>;
};

// ============================================================
// SPINNER
// ============================================================
export const Spinner = ({ size = 20, className }) => (
  <Loader2 size={size} className={classNames('animate-spin text-brand-400', className)} />
);

export const PageLoader = () => (
  <div className="flex items-center justify-center min-h-64">
    <Spinner size={32} />
  </div>
);

// ============================================================
// EMPTY STATE
// ============================================================
export const EmptyState = ({ icon: Icon, title, description, action }) => (
  <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
    {Icon && <div className="p-4 bg-surface-700/50 rounded-2xl mb-4"><Icon size={32} className="text-slate-500" /></div>}
    <p className="text-base font-semibold text-slate-300 mb-1">{title}</p>
    {description && <p className="text-sm text-slate-500 mb-4 max-w-xs">{description}</p>}
    {action}
  </div>
);

// ============================================================
// CONFIRM DIALOG
// ============================================================
export const ConfirmDialog = ({ open, onClose, onConfirm, title, message, confirmLabel = 'Confirm', loading }) => (
  <Modal open={open} onClose={onClose} title={title} size="sm"
    footer={
      <>
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button variant="danger" onClick={onConfirm} loading={loading}>{confirmLabel}</Button>
      </>
    }
  >
    <div className="flex gap-3">
      <AlertTriangle size={20} className="text-amber-400 flex-shrink-0 mt-0.5" />
      <p className="text-sm text-slate-300">{message}</p>
    </div>
  </Modal>
);

// ============================================================
// INFO BOX
// ============================================================
export const InfoBox = ({ children, variant = 'info' }) => {
  const vars = {
    info:  'bg-blue-900/20 border-blue-800/50 text-blue-300',
    warn:  'bg-amber-900/20 border-amber-800/50 text-amber-300',
    error: 'bg-red-900/20 border-red-800/50 text-red-300',
  };
  return (
    <div className={classNames('flex gap-2 p-3 rounded-lg border text-xs', vars[variant])}>
      <Info size={14} className="flex-shrink-0 mt-0.5" />
      <span>{children}</span>
    </div>
  );
};

// ============================================================
// SEARCH INPUT
// ============================================================
export const SearchInput = ({ value, onChange, placeholder = 'Search…', className }) => {
  return (
    <div className={classNames('relative', className)}>
      <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
      </svg>
      <input
        type="text"
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        className="w-full bg-surface-900 border border-surface-700 rounded-lg pl-9 pr-3 py-2 text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
      />
    </div>
  );
};
