-- Create table for tracking part-time staff advances and balances
create table if not exists part_time_advance_tracking (
  id uuid default uuid_generate_v4() primary key,
  staff_name text not null,
  location text not null,
  week_start_date date not null, -- Identify the week by its start date
  year integer not null,
  month integer not null,
  week_number integer not null, -- Week index in the month (0-4)
  
  opening_balance decimal(10,2) default 0,
  advance_given decimal(10,2) default 0,
  earnings decimal(10,2) default 0,
  adjustment decimal(10,2) default 0,
  pending_salary decimal(10,2) default 0,
  closing_balance decimal(10,2) default 0,
  
  notes text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null,
  
  -- ensure unique record per staff per week
  unique(staff_name, location, year, month, week_number)
);

-- Create table for tracking settlement status (moving from localStorage to DB)
create table if not exists part_time_settlements (
  id uuid default uuid_generate_v4() primary key,
  staff_name text not null,
  location text not null,
  settlement_key text not null, -- The unique key used in logic: {name}-{loc}-weekly-{y}-{m}-{w}
  is_settled boolean default false,
  
  settled_at timestamp with time zone,
  settled_by uuid references auth.users(id),
  
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null,
  
  unique(settlement_key)
);

-- Enable RLS
alter table part_time_advance_tracking enable row level security;
alter table part_time_settlements enable row level security;

-- Policies for advance tracking
create policy "Enable all access for authenticated users" on part_time_advance_tracking
  for all using (auth.role() = 'authenticated');

-- Policies for settlements
create policy "Enable all access for authenticated users" on part_time_settlements
  for all using (auth.role() = 'authenticated');
