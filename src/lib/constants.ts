import { Home, Briefcase, Palette } from "lucide-react";

export type PlaceType = "1st" | "2nd" | "3rd";

export const PLACES = [
    {
        id: "1st" as PlaceType,
        label: "Home",
        description: "自宅・家庭のタスク",
        icon: Home,
        color: "from-orange-100 to-amber-50",
        textColor: "text-orange-700",
        activeBg: "bg-orange-500",
    },
    {
        id: "2nd" as PlaceType,
        label: "Work",
        description: "職場・学校のタスク",
        icon: Briefcase,
        color: "from-blue-100 to-indigo-50",
        textColor: "text-blue-700",
        activeBg: "bg-blue-600",
    },
    {
        id: "3rd" as PlaceType,
        label: "Hobby",
        description: "趣味・交流のタスク",
        icon: Palette,
        color: "from-emerald-100 to-teal-50",
        textColor: "text-emerald-700",
        activeBg: "bg-emerald-500",
    },
];
