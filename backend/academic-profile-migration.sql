-- Add Academic and Supplemental Profile Fields
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS school_name TEXT,
ADD COLUMN IF NOT EXISTS unweighted_gpa NUMERIC(3,2),
ADD COLUMN IF NOT EXISTS weighted_gpa NUMERIC(3,2),
ADD COLUMN IF NOT EXISTS sat_score INTEGER,
ADD COLUMN IF NOT EXISTS act_score INTEGER,
ADD COLUMN IF NOT EXISTS profile_bio TEXT,
ADD COLUMN IF NOT EXISTS demographics JSONB DEFAULT '{}'::jsonb;

-- Comment for documentation
COMMENT ON COLUMN public.profiles.unweighted_gpa IS 'Student unweighted GPA (out of 4.0)';
COMMENT ON COLUMN public.profiles.sat_score IS 'Highest composite SAT score';
