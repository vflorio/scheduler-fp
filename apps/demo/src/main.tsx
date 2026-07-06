import { CssBaseline, createTheme, ThemeProvider } from "@mui/material";
import { createRoot } from "react-dom/client";

export { config } from "./env";

function App() {
  return (
    <ThemeProvider theme={createTheme({ palette: { mode: "light" } })}>
      <CssBaseline />
    </ThemeProvider>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
