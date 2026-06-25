import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Navigate, Outlet, Route, Routes } from "react-router-dom";
import { AuthProvider, useAuth } from "./auth";
import { I18nProvider } from "./i18n";
import { Layout } from "./components/Layout";
import { Loading } from "./components/UI";
import { LoginPage } from "./pages/Login";
import { DashboardPage } from "./pages/Dashboard";
import { ProjectsPage } from "./pages/Projects";
import { ProjectDetailPage } from "./pages/ProjectDetail";
import { TicketsPage } from "./pages/Tickets";
import { TicketDetailPage } from "./pages/TicketDetail";
import { RequestDetailPage, RequestsPage } from "./pages/Requests";
import { AdminPage } from "./pages/Admin";
import { NotificationsPage } from "./pages/Notifications";
import { PublicIssuePage, PublicRequestPage, TrackingPage } from "./pages/Public";
import { WallboardPage } from "./pages/Wallboard";
import { BriefingProjectPage, ProgressBriefingPage } from "./pages/Briefing";
import "./styles.css";

function Protected() {
  const { user, loading } = useAuth();
  if (loading) return <Loading />;
  return user ? <Outlet /> : <Navigate to="/login" replace />;
}

function LoginRoute() {
  const { user, loading } = useAuth();
  if (loading) return <Loading />;
  return user ? <Navigate to="/" replace /> : <LoginPage />;
}

function LeadProtected() {
  const { user } = useAuth();
  return user?.role === "admin" || user?.role === "lead" ? <Outlet /> : <Navigate to="/" replace />;
}

function App() {
  return <Routes>
    <Route path="/p/:token" element={<PublicIssuePage />} />
    <Route path="/request" element={<PublicRequestPage />} />
    <Route path="/track/:token" element={<TrackingPage />} />
    <Route path="/wallboard" element={<WallboardPage />} />
    <Route path="/login" element={<LoginRoute />} />
    <Route element={<Protected />}><Route element={<Layout />}>
      <Route index element={<DashboardPage />} />
      <Route path="projects" element={<ProjectsPage />} />
      <Route path="projects/:id" element={<ProjectDetailPage />} />
      <Route path="tickets" element={<TicketsPage />} />
      <Route path="tickets/:id" element={<TicketDetailPage />} />
      <Route path="requests" element={<RequestsPage />} />
      <Route path="requests/:id" element={<RequestDetailPage />} />
      <Route element={<LeadProtected />}>
        <Route path="briefing" element={<ProgressBriefingPage />} />
        <Route path="briefing/:id" element={<BriefingProjectPage />} />
      </Route>
      <Route path="admin" element={<AdminPage />} />
      <Route path="notifications" element={<NotificationsPage />} />
    </Route></Route>
    <Route path="*" element={<Navigate to="/" replace />} />
  </Routes>;
}

ReactDOM.createRoot(document.getElementById("root")!).render(<React.StrictMode><BrowserRouter><I18nProvider><AuthProvider><App /></AuthProvider></I18nProvider></BrowserRouter></React.StrictMode>);
