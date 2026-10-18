export const bytes = (value?: number | null) => Number.isFinite(value) ? `${(value! / 1024 ** 2).toFixed(1)} MiB` : '未知';
