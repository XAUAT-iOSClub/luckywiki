import { useTheme } from "next-themes";
import { Tabs, TabsList, TabsTrigger } from "./ui/tabs";
import { Moon, Sun, MonitorSmartphone } from "lucide-react";
import { useT } from "@/lib/i18n/provider";
import { cn } from "@/lib/utils";

export function ThemeSwitcher({className}: {className?: string}) {
    const { setTheme, theme } = useTheme();
    const t = useT();

    return (
        <Tabs defaultValue={theme} className={cn("items-center w-full", className)} onValueChange={(value) => setTheme(value)}>
            <TabsList>
                <TabsTrigger value="light" aria-label={t.common.lightTheme}>
                    <Sun className="size-4" />
                </TabsTrigger>
                <TabsTrigger value="system" aria-label={t.common.systemTheme}>
                    <MonitorSmartphone className="size-4" />
                </TabsTrigger>
                <TabsTrigger value="dark" aria-label={t.common.darkTheme}>
                    <Moon className="size-4" />
                </TabsTrigger>
            </TabsList>
        </Tabs>
    );
}