import React from 'react';

interface DeviceFrameProps {
  deviceView: 'desktop' | 'tablet' | 'mobile';
  children: React.ReactNode;
}

export const DeviceFrame: React.FC<DeviceFrameProps> = ({ deviceView, children }) => {
  if (deviceView === 'desktop') {
    return <div className="sori-device-frame w-full min-h-screen bg-[#F4F1EC] text-[#1C1B1A]">{children}</div>;
  }

  const widthClass = deviceView === 'tablet' ? 'max-w-[768px]' : 'max-w-[375px]';

  return (
    <div className="sori-device-frame sori-device-frame--simulator min-h-screen w-full bg-[#F4F1EC] p-2 sm:p-8 flex justify-center items-start overflow-x-hidden">
      <div
        className={`sori-device-frame__viewport w-full min-w-0 ${widthClass} bg-[#FAF8F5] border-2 sm:border-4 border-[#DAD7D0] rounded-[20px] sm:rounded-[32px] shadow-xl overflow-hidden min-h-[700px] flex flex-col transition-all duration-300 relative`}
      >
        {/* Device Notch / Top Bar */}
        <div className="bg-[#EFECE6] py-2 px-4 sm:px-6 flex items-center justify-between border-b border-[#E6E3DD] text-[10px] text-[#656461] font-mono select-none">
          <span>9:41 AM</span>
          <div className="w-16 h-3 bg-[#DAD7D0] rounded-full mx-auto"></div>
          <span>100% ⚡</span>
        </div>

        {/* Scrollable Content inside viewport simulator */}
        <div className="flex-1 overflow-y-auto bg-[#FAF8F5] text-[#1C1B1A]">{children}</div>

        {/* Device Bottom Indicator */}
        <div className="bg-[#EFECE6] py-2 flex justify-center border-t border-[#E6E3DD]">
          <div className="w-28 h-1 bg-[#DAD7D0] rounded-full"></div>
        </div>
      </div>
    </div>
  );
};
