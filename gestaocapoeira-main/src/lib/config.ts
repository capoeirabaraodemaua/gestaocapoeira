export const isDemo = process.env.NEXT_PUBLIC_APP_MODE === "demo";
export const trialDays = Number(process.env.NEXT_PUBLIC_TRIAL_DAYS || 3);
