"use client";

import { Home, Terminal, Library, Settings, Shield } from "lucide-react";
import { NavBar } from "@/components/ui/tubelight-navbar";
import { isSuperAdmin } from "@/lib/auth";
import { useEffect, useState } from "react";

const baseNavItems = [
  { name: "Home", url: "/", icon: Home },
  { name: "Terminal", url: "/terminal", icon: Terminal },
  { name: "Library", url: "/library", icon: Library },
  { name: "Settings", url: "/settings", icon: Settings },
];

export function SiteNav() {
  const [admin, setAdmin] = useState(false);

  useEffect(() => {
    setAdmin(isSuperAdmin());
  }, []);

  const items = admin
    ? [
        { name: "Admin", url: "/admin", icon: Shield },
        ...baseNavItems,
      ]
    : baseNavItems;

  return <NavBar items={items} />;
}
