
-- Fix: Allow anon users to insert/update/delete floors
CREATE POLICY "Allow anon insert floors" ON public.floors FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Allow anon update floors" ON public.floors FOR UPDATE TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Allow anon delete floors" ON public.floors FOR DELETE TO anon USING (true);

-- Fix: Allow anon users to insert/update/delete designations
CREATE POLICY "Allow anon insert designations" ON public.designations FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Allow anon update designations" ON public.designations FOR UPDATE TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Allow anon delete designations" ON public.designations FOR DELETE TO anon USING (true);
