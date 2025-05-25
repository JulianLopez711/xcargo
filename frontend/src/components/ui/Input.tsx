import React, { forwardRef } from 'react';
import '../../styles/Input.css';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helper?: string;
  icon?: React.ReactNode;
  fullWidth?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(({
  label,
  error,
  helper,
  icon,
  fullWidth = false,
  className = '',
  ...props
}, ref) => {
  const inputClass = `input ${error ? 'input--error' : ''} ${fullWidth ? 'input--full-width' : ''} ${className}`.trim();
  const containerClass = `input-container ${fullWidth ? 'input-container--full-width' : ''}`.trim();

  return (
    <div className={containerClass}>
      {label && <label className="input-label">{label}</label>}
      <div className="input-wrapper">
        {icon && <span className="input-icon">{icon}</span>}
        <input
          ref={ref}
          className={inputClass}
          {...props}
        />
      </div>
      {error && <span className="input-error">{error}</span>}
      {helper && !error && <span className="input-helper">{helper}</span>}
    </div>
  );
});

Input.displayName = 'Input';