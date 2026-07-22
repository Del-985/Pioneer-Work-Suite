import React from "react";

import "../../styles/ui-primitives.css";

interface SectionHeaderProps {
  title: string;
  description?: string;
  eyebrow?: string;
  actions?: React.ReactNode;
  headingId?: string;
}

const SectionHeader: React.FC<SectionHeaderProps> = ({
  title,
  description,
  eyebrow,
  actions,
  headingId,
}) => (
  <header className="ui-section-header">
    <div>
      {eyebrow && <p className="ui-section-header__eyebrow">{eyebrow}</p>}
      <h2 id={headingId}>{title}</h2>
      {description && <p>{description}</p>}
    </div>
    {actions && <div className="ui-section-header__actions">{actions}</div>}
  </header>
);

export default SectionHeader;
