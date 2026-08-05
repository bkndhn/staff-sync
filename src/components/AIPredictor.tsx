import React, { useMemo } from 'react';
import { Attendance } from '../types';
import { Sparkles, Users, TrendingUp } from 'lucide-react';

interface AIPredictorProps {
    attendance: Attendance[];
    userLocation?: string;
    userFloor?: string;
}

export const AIPredictor: React.FC<AIPredictorProps> = ({ attendance, userLocation, userFloor }) => {
    const prediction = useMemo(() => {
        // Filter attendance to only Flex Staff in the target location/zone
        const flexRecords = attendance.filter(r => 
            r.isPartTime && 
            (!userLocation || r.location === userLocation) &&
            (!userFloor || r.floor === userFloor)
        );

        // Group by Date
        const dailyCounts: Record<string, number> = {};
        flexRecords.forEach(r => {
            dailyCounts[r.date] = (dailyCounts[r.date] || 0) + 1;
        });

        // Extract Sundays
        const sundayCounts: number[] = [];
        Object.entries(dailyCounts).forEach(([dateStr, count]) => {
            const d = new Date(dateStr);
            if (d.getDay() === 0) {
                sundayCounts.push(count);
            }
        });

        if (sundayCounts.length === 0) return null;

        // Calculate simple moving average and trend
        const recentSundays = sundayCounts.slice(-4); // Last 4 Sundays
        const avg = recentSundays.reduce((a, b) => a + b, 0) / recentSundays.length;
        
        // Simple prediction: Base + Trend (if last sunday > avg, add 10% buffer)
        let suggested = avg;
        if (recentSundays.length >= 2) {
            const last = recentSundays[recentSundays.length - 1];
            const prev = recentSundays[recentSundays.length - 2];
            if (last > prev) {
                suggested = avg * 1.1; // Upward trend buffer
            }
        }

        const predictedCount = Math.ceil(suggested);
        const currentAvg = Math.round(avg);

        return {
            predictedCount,
            currentAvg,
            isTrendingUp: suggested > avg
        };

    }, [attendance, userLocation, userFloor]);

    if (!prediction) return null;

    return (
        <div className="bg-gradient-to-br from-indigo-900 via-purple-900 to-indigo-950 rounded-3xl p-5 md:p-6 shadow-2xl relative overflow-hidden group">
            {/* Background Effects */}
            <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/20 rounded-full blur-3xl -mr-20 -mt-20 pointer-events-none group-hover:bg-indigo-500/30 transition-all duration-700" />
            <div className="absolute bottom-0 left-0 w-48 h-48 bg-purple-500/20 rounded-full blur-3xl -ml-10 -mb-10 pointer-events-none" />

            <div className="relative z-10 flex flex-col md:flex-row gap-6 items-start md:items-center justify-between">
                <div className="flex items-start gap-4">
                    <div className="w-12 h-12 rounded-2xl bg-white/10 backdrop-blur-md flex items-center justify-center border border-white/20 shadow-inner flex-shrink-0">
                        <Sparkles size={24} className="text-indigo-300" />
                    </div>
                    <div>
                        <h3 className="text-xl font-bold text-white flex items-center gap-2">
                            AI Shift Predictor
                            <span className="px-2 py-0.5 rounded-full bg-indigo-500/30 border border-indigo-400/30 text-[10px] font-bold text-indigo-200 tracking-wider uppercase">Beta</span>
                        </h3>
                        <p className="text-indigo-200/80 text-sm mt-1 max-w-md leading-relaxed">
                            Based on footfall trends from the last {prediction.currentAvg > 0 ? '4 weeks' : 'few days'}, we recommend scheduling <strong className="text-white bg-white/10 px-1.5 py-0.5 rounded"> {prediction.predictedCount} Flex Staff </strong> for the upcoming Sunday.
                        </p>
                    </div>
                </div>

                <div className="flex gap-4 items-center bg-black/20 p-4 rounded-2xl border border-white/10 backdrop-blur-sm w-full md:w-auto">
                    <div className="text-center px-4">
                        <div className="text-indigo-300 text-xs font-semibold mb-1 uppercase tracking-wider">Avg Sunday</div>
                        <div className="text-2xl font-black text-white flex items-center justify-center gap-1">
                            {prediction.currentAvg} <Users size={16} className="text-indigo-400/70" />
                        </div>
                    </div>
                    <div className="w-px h-10 bg-white/10" />
                    <div className="text-center px-4">
                        <div className="text-emerald-400 text-xs font-semibold mb-1 uppercase tracking-wider flex items-center gap-1 justify-center">
                            AI Target {prediction.isTrendingUp && <TrendingUp size={12} />}
                        </div>
                        <div className="text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-cyan-400">
                            {prediction.predictedCount}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
