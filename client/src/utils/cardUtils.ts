const gradientDirections = [
    "bg-gradient-to-t",
    "bg-gradient-to-tr",
    "bg-gradient-to-r",
    "bg-gradient-to-br",
    "bg-gradient-to-b",
    "bg-gradient-to-bl",
    "bg-gradient-to-l",
    "bg-gradient-to-tl"
];

const colorCombos = [
    "from-red-300 to-yellow-700",
    "from-green-300 to-blue-700",
    "from-purple-300 to-pink-700",
    "from-yellow-300 to-orange-700",
    "from-indigo-300 to-purple-700",
    "from-pink-300 to-red-700",
    "from-blue-300 to-indigo-700",
    "from-orange-300 to-red-700",
    "from-teal-300 to-green-700",
    "from-cyan-300 to-teal-700",
    "from-lime-300 to-green-700",
    "from-amber-300 to-orange-700",
    "from-rose-300 to-pink-700",
    "from-violet-300 to-purple-700",
    "from-sky-300 to-cyan-700",
    "from-fuchsia-300 to-purple-700",
    "from-emerald-300 to-teal-700",
    "from-slate-300 to-gray-700",
    "from-zinc-300 to-slate-700",
    "from-stone-300 to-zinc-700",
    "from-neutral-300 to-stone-700",
    "from-red-300 to-pink-700",
    "from-orange-300 to-amber-700",
    "from-yellow-300 to-lime-700",
    "from-green-300 to-emerald-700",
    "from-teal-300 to-cyan-700",
    "from-blue-300 to-sky-700",
    "from-indigo-300 to-blue-700",
    "from-purple-300 to-indigo-700",
];

export const getIconFromHash = (id: string): string => {
    let hash = 0;
    for (let i = 0; i < id.length; i++) {
        hash = (hash << 5) - hash + id.charCodeAt(i);
    }

    const colorIndex = Math.abs(hash) % colorCombos.length;
    const directionIndex = Math.abs(Math.floor(hash / colorCombos.length)) % gradientDirections.length;

    return `${gradientDirections[directionIndex]} ${colorCombos[colorIndex]}`;
};

const timeUnits = [
    { unit: 'w', value: 60 * 60 * 24 * 7 },
    { unit: 'd', value: 60 * 60 * 24 },
    { unit: 'h', value: 60 * 60 },
    { unit: 'm', value: 60 },
];

export const timeAgo = (unixTime: number) => {
    let seconds = Math.floor(new Date().getTime() / 1000 - unixTime);

    if (seconds < 60) return `now`;

    for (let unit of timeUnits) {
        if (seconds >= unit.value) {
            return `${Math.floor(seconds / unit.value)}${unit.unit}`;
        }
        seconds %= unit.value;
    }
};