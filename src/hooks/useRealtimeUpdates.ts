import { useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Attendance, Staff } from '../types';
import { attendanceService } from '../services/attendanceService';
import { staffService } from '../services/staffService';

export const useRealtimeUpdates = (
  onAttendanceChange: (record: Attendance) => void,
  onStaffChange: (record: Staff) => void
) => {
  useEffect(() => {
    const attendanceChannel = supabase
      .channel('public:attendance')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'attendance' },
        (payload) => {
          if (payload.new && Object.keys(payload.new).length > 0) {
            const mapped = attendanceService.mapFromDatabase(payload.new);
            onAttendanceChange(mapped);
          }
        }
      )
      .subscribe();

    const staffChannel = supabase
      .channel('public:staff')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'staff' },
        (payload) => {
          if (payload.new && Object.keys(payload.new).length > 0) {
            const mapped = staffService.mapFromDatabase(payload.new);
            onStaffChange(mapped);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(attendanceChannel);
      supabase.removeChannel(staffChannel);
    };
  }, [onAttendanceChange, onStaffChange]);
};
