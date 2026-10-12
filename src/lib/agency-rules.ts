export const stages = ['WAITING_FOR_FOOTAGE','FILMING','EDITING_SHORT_FORM','EDITING_LONG_FORM','DESIGNING_THUMBNAIL','IN_REVIEW','UPLOADING','PUBLISHED'] as const;
export function isLongForm(seconds:number){return seconds >= 240;}
export function customFeeValid(fee:number){return fee>=0 && fee<=20000 && fee%1000===0;}
export function durationSeconds(duration:string){const m=duration.match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/);return m?Number(m[1]||0)*3600+Number(m[2]||0)*60+Number(m[3]||0):0;}
export function label(value:string){return value.toLowerCase().replaceAll('_',' ').replace(/^./,s=>s.toUpperCase());}