import { useTheme } from "next-themes";
import { Tabs, TabsList, TabsTrigger } from "./ui/tabs";
import { Moon, Sun, MonitorSmartphone } from "lucide-react";
import { useT } from "@/lib/i18n/provider";
import { cn } from "@/lib/utils";
import { useEffect, useRef, useState } from "react";

export function ThemeSwitcher({className}: {className?: string}) {
    const { setTheme, theme } = useTheme();
    const t = useT();
    const transitioning = useRef(false);
    const [mounted, setMounted] = useState(false);
    useEffect(() => setMounted(true), []);

    const toggleTheme = (newTheme: string, event?: React.MouseEvent | React.KeyboardEvent) => {
        if (newTheme === theme || transitioning.current) return;

        const isAppearanceTransition =
            // @ts-expect-error - document.startViewTransition is not yet in the default types
            document.startViewTransition &&
            !window.matchMedia('(prefers-reduced-motion: reduce)').matches

        if (!isAppearanceTransition) {
            setTheme(newTheme)
            return
        }

        transitioning.current = true;
        const x = event && 'clientX' in event ? event.clientX : window.innerWidth / 2
        const y = event && 'clientY' in event ? event.clientY : window.innerHeight / 2
        const endRadius = Math.hypot(
            Math.max(x, window.innerWidth - x),
            Math.max(y, window.innerHeight - y)
        )

        const transition = document.startViewTransition(async () => {
            setTheme(newTheme)
        })

        transition.ready.then(() => {
            const clipPath = [
                `circle(0px at ${x}px ${y}px)`,
                `circle(${endRadius}px at ${x}px ${y}px)`,
            ]
            const isDark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)

            document.documentElement.animate(
                {
                    clipPath: isDark ? [...clipPath].reverse() : clipPath,
                },
                {
                    duration: 400,
                    easing: 'ease-in-out',
                    pseudoElement: isDark
                        ? '::view-transition-old(root)'
                        : '::view-transition-new(root)',
                }
            )
        })

        transition.finished.finally(() => {
            transitioning.current = false;
        })
    }

    return (
        <Tabs value={mounted ? theme : undefined} className={cn("items-center w-full", className)}>
            <TabsList>
                <TabsTrigger
                    value="light"
                    aria-label={t.common.lightTheme}
                    onClick={(e) => toggleTheme("light", e)}
                >
                    <Sun className="size-4" />
                </TabsTrigger>
                <TabsTrigger
                    value="system"
                    aria-label={t.common.systemTheme}
                    onClick={(e) => toggleTheme("system", e)}
                >
                    <MonitorSmartphone className="size-4" />
                </TabsTrigger>
                <TabsTrigger
                    value="dark"
                    aria-label={t.common.darkTheme}
                    onClick={(e) => toggleTheme("dark", e)}
                >
                    <Moon className="size-4" />
                </TabsTrigger>
            </TabsList>
        </Tabs>
    );
}