import React from "react";

import "../../styles/ui-primitives.css";

type ButtonTone = "default" | "primary" | "danger" | "quiet";

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  tone?: ButtonTone;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ tone = "default", className = "", type = "button", ...props }, ref) => (
    <button
      ref={ref}
      type={type}
      className={`ui-button ui-button--${tone} ${className}`.trim()}
      {...props}
    />
  )
);

Button.displayName = "Button";

export default Button;
