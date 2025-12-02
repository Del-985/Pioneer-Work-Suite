import React from "react";
import { useNavigate } from "react-router-dom";

interface Org {
  id: string;
  name: string;
}

const OrgListPage: React.FC = () => {
  const navigate = useNavigate();

  // For now this is just placeholder data.
  // Later we’ll replace this with a call to /orgs.
  const orgs: Org[] = [
    { id: "1", name: "Personal Workspace" },
    { id: "2", name: "Demo Company, Inc." },
  ];

  function handleSelectOrg(orgId: string) {
    // Eventually this might store the selected org in state
    // and navigate to that org's invoices dashboard.
    navigate(`/orgs/${orgId}/invoices`);
  }

  function handleCreateOrg() {
    // Placeholder: later we’ll open a "create org" flow or modal.
    alert("Create org flow not implemented yet.");
  }

  const userName =
    typeof window !== "undefined"
      ? window.localStorage.getItem("userName") ?? "there"
      : "there";

  return (
    <div className="org-page">
      <header className="org-header">
        <h2 className="org-title">Organizations</h2>
        <p className="org-subtitle">
          Welcome back, {userName}. Choose a workspace to enter.
        </p>
        <button
          type="button"
          className="org-create-button"
          onClick={handleCreateOrg}
        >
          + New organization
        </button>
      </header>

      <div className="org-list">
        {orgs.map((org) => (
          <button
            key={org.id}
            type="button"
            className="org-card"
            onClick={() => handleSelectOrg(org.id)}
          >
            <div className="org-card-name">{org.name}</div>
            <div className="org-card-meta">ID: {org.id}</div>
          </button>
        ))}
      </div>
    </div>
  );
};

export default OrgListPage;