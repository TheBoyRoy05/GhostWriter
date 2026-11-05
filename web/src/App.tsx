import { Redirect, Route, Switch } from "wouter";
import { Toaster } from "@/components/ui/sonner";
import AppShell from "./AppShell";
import ApplicationList from "./ApplicationList";
import NewApplication from "./NewApplication";
import ProfilePage from "./ProfilePage";
import ResumeView from "./ResumeView";

export default function App() {
  return (
    <AppShell>
      <Switch>
        <Route path="/" component={ResumeView} />
        <Route path="/new" component={NewApplication} />
        <Route path="/applications/:id?" component={ApplicationList} />
        <Route path="/profile" component={ProfilePage} />
        <Route>
          <Redirect to="/" />
        </Route>
      </Switch>
      <Toaster position="bottom-left" />
    </AppShell>
  );
}
