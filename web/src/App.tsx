// adapted from lakshyamody/dbmsproj (landing)
import { BrowserRouter, Route, Routes } from "react-router-dom"
import Landing from "@/pages/Landing"
import { Placeholder } from "@/pages/Placeholder"

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/console" element={<Placeholder name="Console · who's on console?" />} />
        <Route path="/ops" element={<Placeholder name="Ops" />} />
        <Route path="/routing" element={<Placeholder name="Routing" />} />
        <Route path="/brain" element={<Placeholder name="Brain" />} />
        <Route path="/deploy" element={<Placeholder name="Deploy" />} />
        <Route path="/labs/:lab" element={<Placeholder name="Lab" />} />
        <Route path="*" element={<Placeholder name="Not found" />} />
      </Routes>
    </BrowserRouter>
  )
}
