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