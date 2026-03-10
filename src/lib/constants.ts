import { Home, Briefcase, Palette, ShoppingCart } from "lucide-react";

export type PlaceType = "1st" | "2nd" | "3rd" | "4th";

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
    {
        id: "4th" as PlaceType,
        label: "Shopping",
        description: "買い物・ウィッシュリスト",
        icon: ShoppingCart,
        color: "from-rose-100 to-pink-50",
        textColor: "text-rose-700",
        activeBg: "bg-rose-500",
    },
];

export const SHOPPING_LOCATIONS = [
    "スーパー",
    "100均",
    "ドラッグストア",
    "通販（Amazon・楽天等）",
    "ホームセンター",
    "コンビニ",
    "家電量販店",
    "その他"
];
