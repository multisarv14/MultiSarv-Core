import { lazy } from "react";
import { createBrowserRouter, Navigate, RouterProvider } from "react-router-dom";

import { MasterShell } from "./components/layout/MasterShell";
import { SessionProvider } from "./context/session";
import { Login } from "./pages/Login";
import { Dashboard as MasterDashboard } from "./pages/master/Dashboard";
import { ProjectGate } from "./pages/ProjectGate";
import { RequireModule, RequireSession, RequireSuper } from "./pages/RequireSession";

// Pages vegle chunks — pahila load halka, page ughadlyavar ch download.
const page = <K extends string>(load: () => Promise<Record<K, React.ComponentType>>, name: K) =>
  lazy(() => load().then((m) => ({ default: m[name] })));

const Dashboard = page(() => import("./pages/Dashboard"), "Dashboard");
const Users = page(() => import("./pages/Users"), "Users");
const Kyc = page(() => import("./pages/Kyc"), "Kyc");
const Tasks = page(() => import("./pages/Tasks"), "Tasks");
const Disputes = page(() => import("./pages/Disputes"), "Disputes");
const Payouts = page(() => import("./pages/Payouts"), "Payouts");
const Ledger = page(() => import("./pages/Ledger"), "Ledger");
const Catalog = page(() => import("./pages/Catalog"), "Catalog");
const Notifications = page(() => import("./pages/Notifications"), "Notifications");

// Master panel
const Projects = page(() => import("./pages/master/Projects"), "Projects");
const ProjectOverview = page(() => import("./pages/master/projects/ProjectOverview"), "ProjectOverview");
const Billing = page(() => import("./pages/master/ComingSoon"), "Billing");
const Invoicing = page(() => import("./pages/master/ComingSoon"), "Invoicing");
const Receipts = page(() => import("./pages/master/ComingSoon"), "Receipts");
const Accounts = page(() => import("./pages/master/ComingSoon"), "Accounts");
const CompanyProfile = page(() => import("./pages/master/CompanyProfile"), "CompanyProfile");
const AdminUsers = page(() => import("./pages/master/Users"), "Users");
const Chat = page(() => import("./pages/master/Chat"), "Chat");
const Roles = page(() => import("./pages/master/Roles"), "Roles");
const CoreNotifications = page(() => import("./pages/master/Notifications"), "Notifications");
const ModuleAccess = page(() => import("./pages/master/ModuleAccess"), "ModuleAccess");
const ClientTickets = page(() => import("./pages/master/tickets/TicketList"), "ClientTickets");
const DevTickets = page(() => import("./pages/master/tickets/TicketList"), "DevTickets");
const ClientTicketDetail = page(() => import("./pages/master/tickets/TicketDetail"), "ClientTicketDetail");
const DevTicketDetail = page(() => import("./pages/master/tickets/TicketDetail"), "DevTicketDetail");

const router = createBrowserRouter([
  { path: "/login", element: <Login /> },
  {
    element: <RequireSession />,
    children: [
      {
        element: <MasterShell />,
        children: [
          { path: "/", element: <MasterDashboard /> },
          { path: "/projects", element: <Projects /> },
          { path: "/projects/:projectId", element: <ProjectOverview /> },
          { path: "/chat", element: <Chat /> },
          {
            element: <RequireModule module="clientTickets" />,
            children: [
              { path: "/client-tickets", element: <ClientTickets /> },
              { path: "/client-tickets/:ticketId", element: <ClientTicketDetail /> },
            ],
          },
          {
            element: <RequireModule module="devTickets" />,
            children: [
              { path: "/dev-tickets", element: <DevTickets /> },
              { path: "/dev-tickets/:ticketId", element: <DevTicketDetail /> },
            ],
          },
          {
            element: <RequireSuper />,
            children: [
              { path: "/billing", element: <Billing /> },
              { path: "/invoicing", element: <Invoicing /> },
              { path: "/receipts", element: <Receipts /> },
              { path: "/accounts", element: <Accounts /> },
              { path: "/settings", element: <Navigate to="/settings/company" replace /> },
              { path: "/settings/company", element: <CompanyProfile /> },
              { path: "/settings/users", element: <AdminUsers /> },
              { path: "/settings/access", element: <ModuleAccess /> },
              { path: "/settings/roles", element: <Roles /> },
              { path: "/notifications", element: <CoreNotifications /> },
            ],
          },
        ],
      },
      // Juna link.
      { path: "/admins", element: <Navigate to="/settings/users" replace /> },
      {
        path: "/p/:projectId",
        element: <ProjectGate />,
        children: [
          { index: true, element: <Dashboard /> },
          { path: "users", element: <Users /> },
          { path: "kyc", element: <Kyc /> },
          { path: "tasks", element: <Tasks /> },
          { path: "disputes", element: <Disputes /> },
          { path: "payouts", element: <Payouts /> },
          { path: "ledger", element: <Ledger /> },
          { path: "notifications", element: <Notifications /> },
          { path: "catalog", element: <Catalog /> },
          { path: "*", element: <Navigate to="." replace /> },
        ],
      },
    ],
  },
  { path: "*", element: <Navigate to="/" replace /> },
]);

export function App() {
  return (
    <SessionProvider>
      <RouterProvider router={router} />
    </SessionProvider>
  );
}
