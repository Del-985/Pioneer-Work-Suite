import React from "react";

import "../../styles/ui-primitives.css";

interface CardProps extends React.HTMLAttributes<HTMLElement> {
  as?: "section" | "article" | "div";
}

const Card: React.FC<CardProps> = ({
  as: Element = "section",
  className = "",
  ...props
}) => <Element className={`ui-card ${className}`.trim()} {...props} />;

export default Card;
