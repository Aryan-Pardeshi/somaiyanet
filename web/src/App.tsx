import { BrowserRouter, Route, Routes } from "react-router-dom"
import Landing from "@/pages/Landing"
import Console from "@/pages/Console"
import Ops from "@/pages/Ops"
import Routing from "@/pages/Routing"
import Brain from "@/pages/Brain"
import Deploy from "@/pages/Deploy"
import { Placeholder } from "@/pages/Placeholder"
import Lab from "@/pages/Lab"
import { AppShell } from "@/app/AppShell"
import { AnimationLoader } from "@/components/AnimationLoader"

function Shelled({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>
}

export default function App() {
  return (
    <BrowserRouter>
      <AnimationLoader />
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/console" element={<Console />} />
        <Route path="/ops" element={<Shelled><Ops /></Shelled>} />
        <Route path="/routing" element={<Shelled><Routing /></Shelled>} />
        <Route path="/brain" element={<Shelled><Brain /></Shelled>} />
        <Route path="/deploy" element={<Shelled><Deploy /></Shelled>} />
        <Route path="/labs/:lab" element={<Shelled><Lab /></Shelled>} />
        <Route path="*" element={<Shelled><Placeholder name="Not found" /></Shelled>} />
      </Routes>
    </BrowserRouter>
  )
}
