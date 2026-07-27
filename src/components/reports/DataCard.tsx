'use client';

interface DataCardProps {
  title: string;
  value: number | string;
  icon?: string;
  trend?: number;
  color?: string;
}

export function DataCard({ title, value, icon = '📊', trend, color = 'from-blue-400 to-blue-600' }: DataCardProps) {
  const isPositiveTrend = trend && trend > 0;
  const isNegativeTrend = trend && trend < 0;

  return (
    <div className="card group hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="text-sm text-gray-500 font-medium">{title}</div>
          <div className="text-2xl font-bold text-gray-800 mt-1">{value}</div>
          
          {trend !== undefined && (
            <div className={`mt-2 flex items-center gap-1 text-sm font-medium ${
              isPositiveTrend ? 'text-green-600' : isNegativeTrend ? 'text-red-600' : 'text-gray-600'
            }`}>
              {isPositiveTrend ? '↑' : isNegativeTrend ? '↓' : '→'}
              {Math.abs(trend)}%
              <span className="text-gray-400 font-normal">vs. 上期</span>
            </div>
          )}
        </div>
        
        <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${color} flex items-center justify-center text-white text-xl shadow-sm`}>
          {icon}
        </div>
      </div>
    </div>
  );
}
