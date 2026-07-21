import { FiberManualRecord, Home, Settings } from "@mui/icons-material";
import {
  Box,
  CssBaseline,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Stack,
  ThemeProvider,
  Typography,
} from "@mui/material";
import { match } from "ts-pattern";
import { usePageContext } from "vike-react/usePageContext";
import logoUrl from "../assets/logo.svg";
import { LogPanel } from "../components/LogPanel";
import { LogFeedProvider, useLogFeed } from "../hooks/useLogFeed";
import "./Layout.css";
import { theme } from "../theme";

const NAV_ITEMS = [
  { href: "/", label: "Home", icon: <Home fontSize="small" /> },
  { href: "/settings", label: "Settings", icon: <Settings fontSize="small" /> },
];

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <LogFeedProvider>
        <Box sx={{ display: "flex", height: "100vh", width: "100%" }}>
          <Sidebar />
          <Box id="page-content" component="main" sx={{ flexGrow: 2, minWidth: 0, p: { xs: 2, md: 4 } }}>
            {children}
          </Box>
          <LogPanel />
        </Box>
      </LogFeedProvider>
    </ThemeProvider>
  );
}

function Sidebar() {
  const pageContext = usePageContext();
  const { urlPathname } = pageContext;

  return (
    <Box
      component="nav"
      sx={{
        width: 240,
        flexShrink: 0,
        display: "flex",
        flexDirection: "column",
        gap: 1,
        p: 2,
        borderRight: "1px solid",
        borderColor: "divider",
        bgcolor: "background.paper",
      }}
    >
      <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, px: 1, py: 2 }}>
        <a href="/" style={{ display: "flex" }}>
          <img src={logoUrl} height={36} width={36} alt="logo" />
        </a>
        <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
          Lab Supervisor
        </Typography>
      </Box>
      <List sx={{ display: "flex", flexDirection: "column", gap: 0.5 }}>
        {NAV_ITEMS.map((item) => {
          const isActive = item.href === "/" ? urlPathname === item.href : urlPathname.startsWith(item.href);
          return (
            <ListItemButton
              key={item.href}
              component="a"
              href={item.href}
              selected={isActive}
              sx={{
                "&.Mui-selected": {
                  bgcolor: "primary.main",
                  color: "primary.contrastText",
                  "&:hover": { bgcolor: "primary.main" },
                  "& .MuiListItemIcon-root": { color: "inherit" },
                },
              }}
            >
              <ListItemIcon sx={{ minWidth: 36 }}>{item.icon}</ListItemIcon>
              <ListItemText primary={item.label} />
            </ListItemButton>
          );
        })}
      </List>
      <Box sx={{ mt: "auto" }}>
        <ServiceStatusIndicator />
      </Box>
    </Box>
  );
}

function ServiceStatusIndicator() {
  const { status } = useLogFeed();

  const { color, label } = match(status)
    .with("online", () => ({ color: "success.main" as const, label: "Service online" }))
    .with("reconnecting", () => ({ color: "error.main" as const, label: "Service unreachable" }))
    .with("connecting", () => ({ color: "warning.main" as const, label: "Connecting…" }))
    .exhaustive();

  return (
    <Stack direction="row" spacing={1} sx={{ px: 1, alignItems: "center" }}>
      <FiberManualRecord sx={{ fontSize: 10, color }} />
      <Typography variant="caption" color="text.secondary">
        {label}
      </Typography>
    </Stack>
  );
}
