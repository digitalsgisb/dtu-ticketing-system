import { createContext, useContext, type ReactNode } from "react";

const translations = {
  en: {
    appName: "DTU Control Centre",
    dashboard: "Dashboard",
    projects: "Projects",
    tickets: "Tasks & Issues",
    requests: "Project Requests",
    admin: "Administration",
    briefing: "Progress Briefing",
    wallboard: "Lab Wallboard",
    signOut: "Sign out",
    welcome: "Good to see you",
    activeProjects: "Active projects",
    allProjects: "All Projects",
    myProjects: "My Projects",
    systemLinks: "System Links",
    openIssues: "Open issues",
    overdue: "Overdue",
    awaitingTriage: "Awaiting triage",
    myWork: "My work",
    upcoming: "Upcoming deadlines",
    workload: "Team workload",
    recentActivity: "Recent activity",
    noItems: "Nothing here yet",
    newProject: "New project",
    newTicket: "New work item",
    newRequest: "Request a project",
    reportIssue: "Report an issue",
    save: "Save changes",
    cancel: "Cancel",
    create: "Create",
    status: "Status",
    priority: "Priority",
    assignee: "Assignee",
    dueDate: "Due date",
    owner: "Owner",
    department: "Department",
    progress: "Progress",
    title: "Title",
    description: "Description",
    type: "Type",
    comments: "Updates & comments",
    addComment: "Add update",
    publicUpdate: "Visible to reporter",
    attachments: "Attachments",
    reporter: "Reporter",
    submitted: "Submitted",
    search: "Search",
    all: "All",
    view: "Open",
    approve: "Approve & create project",
    needsInfo: "Needs information",
    reject: "Reject",
    tracking: "Track your request",
    trackIntro: "Keep this private link. It is your key to view updates and reply to DTU.",
    reference: "Reference",
    submit: "Submit",
    success: "Successfully submitted",
    refreshes: "Updates live",
    controlCentre: "Project & Service Operations",
    criticalWork: "Priority work queue",
    projectPortfolio: "Project portfolio",
    lastUpdated: "Last updated"
  }
} as const;

type I18nValue = {
  t: (key: keyof typeof translations.en) => string;
};

const value: I18nValue = { t: key => translations.en[key] };
const I18nContext = createContext<I18nValue>(value);

export function I18nProvider({ children }: { children: ReactNode }) {
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  return useContext(I18nContext);
}
