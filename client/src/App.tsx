import { BrowserRouter, Route, Routes } from "react-router-dom";
import Setup from "./pages/Setup";
import Lecture from "./pages/Lecture";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Setup />} />
        <Route path="/l/:id" element={<Lecture />} />
      </Routes>
    </BrowserRouter>
  );
}
