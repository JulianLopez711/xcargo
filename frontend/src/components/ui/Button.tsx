import React from 'react';
import '../../styles/Button.css';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  fullWidth?: boolean;
  loading?: boolean;
  icon?: React.ReactNode;
}

export const Button: React.FC<ButtonProps> = ({
  children,
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  loading = false,
  icon,
  className = '',
  disabled,
  ...props
}) => {
  const baseClass = 'btn';
  const variantClass = `btn--${variant}`;
  const sizeClass = `btn--${size}`;
  const fullWidthClass = fullWidth ? 'btn--full-width' : '';
  const loadingClass = loading ? 'btn--loading' : '';
  
  const classes = [
    baseClass,
    variantClass,
    sizeClass,
    fullWidthClass,
    loadingClass,
    className
  ].filter(Boolean).join(' ');

  return (
    <button 
      className={classes}
      disabled={disabled || loading}
      {...props}
    >
      {loading && <span className="btn__spinner" />}
      {icon && !loading && <span className="btn__icon">{icon}</span>}
      <span className="btn__text">{children}</span>
    </button>
  );
};