import React from 'react';
import '../../styles/Card.css';

interface CardProps {
  children: React.ReactNode;
  className?: string;
  hover?: boolean;
  padding?: 'sm' | 'md' | 'lg';
  border?: boolean;
}

export const Card: React.FC<CardProps> = ({
  children,
  className = '',
  hover = false,
  padding = 'md',
  border = true,
}) => {
  const baseClass = 'card';
  const hoverClass = hover ? 'card--hover' : '';
  const paddingClass = `card--padding-${padding}`;
  const borderClass = border ? 'card--border' : '';
  
  const classes = [
    baseClass,
    hoverClass,
    paddingClass,
    borderClass,
    className
  ].filter(Boolean).join(' ');

  return (
    <div className={classes}>
      {children}
    </div>
  );
};