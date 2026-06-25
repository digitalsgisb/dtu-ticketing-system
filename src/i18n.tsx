import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

type Language = "en" | "ms";

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
    language: "BM",
    welcome: "Good to see you",
    activeProjects: "Active projects",
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
    qrLabel: "Report Issue / Lapor Masalah",
    refreshes: "Updates automatically every 30 seconds",
    controlCentre: "Project & Service Operations",
    criticalWork: "Priority work queue",
    projectPortfolio: "Project portfolio",
    lastUpdated: "Last updated"
  },
  ms: {
    appName: "Pusat Kawalan DTU",
    dashboard: "Papan Pemuka",
    projects: "Projek",
    tickets: "Tugas & Isu",
    requests: "Permohonan Projek",
    admin: "Pentadbiran",
    briefing: "Taklimat Kemajuan",
    wallboard: "Paparan Makmal",
    signOut: "Log keluar",
    language: "EN",
    welcome: "Selamat kembali",
    activeProjects: "Projek aktif",
    openIssues: "Isu terbuka",
    overdue: "Lewat",
    awaitingTriage: "Menunggu saringan",
    myWork: "Kerja saya",
    upcoming: "Tarikh akhir akan datang",
    workload: "Beban kerja pasukan",
    recentActivity: "Aktiviti terkini",
    noItems: "Belum ada rekod",
    newProject: "Projek baharu",
    newTicket: "Item kerja baharu",
    newRequest: "Mohon projek",
    reportIssue: "Lapor isu",
    save: "Simpan perubahan",
    cancel: "Batal",
    create: "Cipta",
    status: "Status",
    priority: "Keutamaan",
    assignee: "Pegawai",
    dueDate: "Tarikh akhir",
    owner: "Pemilik",
    department: "Jabatan",
    progress: "Kemajuan",
    title: "Tajuk",
    description: "Penerangan",
    type: "Jenis",
    comments: "Kemas kini & ulasan",
    addComment: "Tambah kemas kini",
    publicUpdate: "Boleh dilihat pelapor",
    attachments: "Lampiran",
    reporter: "Pelapor",
    submitted: "Dihantar",
    search: "Cari",
    all: "Semua",
    view: "Buka",
    approve: "Lulus & cipta projek",
    needsInfo: "Perlu maklumat",
    reject: "Tolak",
    tracking: "Jejak permohonan anda",
    trackIntro: "Simpan pautan peribadi ini. Ia ialah kunci untuk melihat kemas kini dan membalas DTU.",
    reference: "Rujukan",
    submit: "Hantar",
    success: "Berjaya dihantar",
    qrLabel: "Report Issue / Lapor Masalah",
    refreshes: "Dikemas kini secara automatik setiap 30 saat",
    controlCentre: "Operasi Projek & Perkhidmatan",
    criticalWork: "Senarai kerja keutamaan",
    projectPortfolio: "Portfolio projek",
    lastUpdated: "Kemas kini terakhir"
  }
} as const;

type I18nValue = {
  lang: Language;
  setLang: (lang: Language) => void;
  t: (key: keyof typeof translations.en) => string;
};

const I18nContext = createContext<I18nValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLanguage] = useState<Language>(() => localStorage.getItem("dtu-language") === "ms" ? "ms" : "en");
  const value = useMemo(() => ({
    lang,
    setLang: (next: Language) => {
      localStorage.setItem("dtu-language", next);
      setLanguage(next);
    },
    t: (key: keyof typeof translations.en) => translations[lang][key]
  }), [lang]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const value = useContext(I18nContext);
  if (!value) throw new Error("I18nProvider is missing");
  return value;
}
