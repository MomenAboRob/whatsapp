import { NextResponse } from 'next/server';
import os from 'os';

export async function GET() {
  const memoryUsage = process.memoryUsage();
  
  const toMB = (bytes: number) => Math.round((bytes / 1024 / 1024) * 10) / 10;
  
  const heapUsed = toMB(memoryUsage.heapUsed);
  const heapTotal = toMB(memoryUsage.heapTotal);
  const rss = toMB(memoryUsage.rss);
  
  const totalMem = toMB(os.totalmem());
  const freeMem = toMB(os.freemem());
  const usedMem = Math.round((totalMem - freeMem) * 10) / 10;
  const memUsagePercent = Math.round((usedMem / totalMem) * 100);

  return NextResponse.json({
    process: {
      heapUsedMb: heapUsed,
      heapTotalMb: heapTotal,
      rssMb: rss,
    },
    system: {
      totalMemMb: totalMem,
      freeMemMb: freeMem,
      usedMemMb: usedMem,
      percentUsed: memUsagePercent,
    },
    uptimeSeconds: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
  });
}
