import { RoutineConfig } from "./types";

export function calculateNextRoutineDate(currentDueISO: string | undefined, config: RoutineConfig): Date {
    const baseDate = currentDueISO ? new Date(currentDueISO) : new Date();
    // 確実に今日より先にするための最低基準
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let nextDate = new Date(baseDate);
    // 過去タスクを完了した際、次の期日が今日よりも前にならないように調整するため
    if (nextDate < today) {
        nextDate = new Date(today);
    }

    switch (config.type) {
        case 'daily':
            nextDate.setDate(nextDate.getDate() + 1);
            break;
        case 'weekly':
            if (config.days && config.days.length > 0) {
                const currentDayOfWeek = nextDate.getDay();
                let addedDays = 0;
                let found = false;
                for (let i = 1; i <= 7; i++) {
                    const checkDay = (currentDayOfWeek + i) % 7;
                    if (config.days.includes(checkDay)) {
                        addedDays = i;
                        found = true;
                        break;
                    }
                }
                nextDate.setDate(nextDate.getDate() + (found ? addedDays : 7));
            } else {
                nextDate.setDate(nextDate.getDate() + 7); // 未設定時は単純に7日後
            }
            break;
        case 'monthly_day':
            nextDate.setMonth(nextDate.getMonth() + 1);
            if (config.dayOfMonth) {
                // 日付が存在しない月（2月30日など）を丸める簡易処理
                nextDate.setDate(Math.min(config.dayOfMonth, new Date(nextDate.getFullYear(), nextDate.getMonth() + 1, 0).getDate()));
            }
            break;
        case 'monthly_week_day':
            if (config.weekNumber && config.days && config.days.length > 0) {
                const targetDayOfWeek = config.days[0];
                const targetWeekNumber = config.weekNumber;

                // 次の月に移動してから計算
                nextDate.setMonth(nextDate.getMonth() + 1);
                nextDate.setDate(1); // 月の初めにリセット

                const firstDayOfMonth = new Date(nextDate.getFullYear(), nextDate.getMonth(), 1);
                const firstDayOfWeek = firstDayOfMonth.getDay();
                
                let day = 1 + (targetDayOfWeek - firstDayOfWeek + 7) % 7;
                day += (targetWeekNumber - 1) * 7;
                
                // 計算結果がその月を超えていないかチェック
                const lastDayOfMonth = new Date(nextDate.getFullYear(), nextDate.getMonth() + 1, 0).getDate();
                if (day > lastDayOfMonth) {
                    // その月の最終の指定曜日をセット
                    let lastDay = lastDayOfMonth;
                    while (lastDay > 0) {
                        const checkDate = new Date(nextDate.getFullYear(), nextDate.getMonth(), lastDay);
                        if (checkDate.getDay() === targetDayOfWeek) break;
                        lastDay--;
                    }
                    nextDate.setDate(lastDay > 0 ? lastDay : 1);
                } else {
                    nextDate.setDate(day);
                }
            } else if (config.weekNumber) {
                // 曜日が未指定の場合は、現在の曜日を維持
                nextDate.setMonth(nextDate.getMonth() + 1);
            }
            break;
        case 'yearly':
        case 'yearly_date':
            nextDate.setFullYear(nextDate.getFullYear() + 1);
            if (config.month) nextDate.setMonth(config.month - 1);
            if (config.dayOfMonth) {
                nextDate.setDate(Math.min(config.dayOfMonth, new Date(nextDate.getFullYear(), nextDate.getMonth() + 1, 0).getDate()));
            }
            break;
        default:
            nextDate.setDate(nextDate.getDate() + 1); // 安全のためのフォールバック
            break;
    }

    return nextDate;
}

export function getDaysSince(dateISO: string | undefined): number {
    if (!dateISO) return 0;
    const start = new Date(dateISO);
    const now = new Date();
    const diffTime = Math.abs(now.getTime() - start.getTime());
    return Math.floor(diffTime / (1000 * 60 * 60 * 24));
}
