"use client";

import React, { useEffect, useState } from 'react';
import { Cpu, HardDrive, RefreshCw, Zap } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

interface SystemStats {
  process: {
    heapUsedMb: number;
    heapTotalMb: number;
    rssMb: number;
  };
  system: {
    totalMemMb: number;
    freeMemMb: number;
    usedMemMb: number;
    percentUsed: number;
  };
  uptimeSeconds: number;
}

export function RamMonitor() {
  const [stats, setStats] = useState<SystemStats | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchStats = async () => {
    try {
      const res = await fetch('/api/system/stats');
      if (res.ok) {
        const data = await res.json();
        setStats(data);
      }
    } catch (e) {
      // تجاهل
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
    const timer = setInterval(fetchStats, 4000);
    return () => clearInterval(timer);
  }, []);

  if (!stats) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/40 px-3 py-1.5 rounded-lg border border-border">
        <Cpu className="w-3.5 h-3.5 animate-pulse text-emerald-500" />
        <span>مراقبة الذاكرة...</span>
      </div>
    );
  }

  const heapMb = stats.process.heapUsedMb;
  const isHealthy = heapMb < 300;

  return (
    <div className="flex items-center gap-2 bg-card/80 backdrop-blur-xl px-3 py-1 rounded-lg border border-border/80 shadow-xs text-xs">
      <div className="flex items-center gap-1.5 font-medium text-foreground">
        <div className="relative flex items-center justify-center">
          <Cpu className="w-4 h-4 text-emerald-500" />
          <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping opacity-75" />
        </div>
        <span className="hidden sm:inline text-muted-foreground text-[11px]">الذاكرة:</span>
        <span className="font-mono text-emerald-500 dark:text-emerald-400 font-bold">{heapMb} MB</span>
      </div>

      <div className="h-3.5 w-px bg-border/60 hidden sm:block" />

      <div className="hidden sm:flex items-center gap-1 text-muted-foreground text-[11px]">
        <HardDrive className="w-3.5 h-3.5" />
        <span>النظام:</span>
        <span className="font-mono text-foreground font-medium">{stats.system.percentUsed}%</span>
      </div>

      <Badge
        variant="outline"
        className="text-[10px] px-1.5 py-0 h-5 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 font-medium"
      >
        <Zap className="w-2.5 h-2.5 ml-1" />
        {isHealthy ? 'خفيف جداً' : 'مرتفع'}
      </Badge>

      <button
        onClick={() => {
          setLoading(true);
          fetchStats();
        }}
        className="text-muted-foreground hover:text-foreground transition-colors p-1 rounded hover:bg-muted cursor-pointer"
        title="تحديث قراءة الذاكرة"
      >
        <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
      </button>
    </div>
  );
}
