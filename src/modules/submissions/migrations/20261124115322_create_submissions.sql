-- migrate:up

CREATE TYPE submission_status AS ENUM ('queued', 'running', 'completed', 'failed');
CREATE TYPE verdict AS ENUM ('accepted', 'wrong_answer', 'runtime_error', 'time_limit_exceeded');


CREATE TABLE submissions (
    -- v7 is time-ordered, so inserts stay at the end of the index, and the id can't be guessed from a URL.
    id UUID PRIMARY KEY DEFAULT uuidv7(),
    problem_id INT NOT NULL,
    -- The problems module's enum, because the foreign key below must match problem_languages exactly.
    language language NOT NULL,
    code TEXT NOT NULL
       CONSTRAINT submissions_code_length CHECK (char_length(code) BETWEEN 1 AND 50000),
    status submission_status NOT NULL DEFAULT 'queued',
    verdict verdict,
    passed_count INT,
    total_count INT,
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    -- Crosses into the problems module on purpose: Postgres guarantees the pair exists,
    -- and RESTRICT stops a problem from being deleted while people's submissions point at it.
    FOREIGN KEY (problem_id, language)
        REFERENCES problem_languages (problem_id, language) ON DELETE RESTRICT,
    CONSTRAINT submissions_verdict_when_completed
        CHECK ((status = 'completed') = (verdict IS NOT NULL))
);

-- migrate:down

DROP TABLE submissions;
DROP TYPE verdict;
DROP TYPE submission_status;
