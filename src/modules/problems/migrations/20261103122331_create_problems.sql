-- migrate:up

CREATE TYPE language AS ENUM ('javascript', 'python');
CREATE TYPE difficulty AS ENUM ('easy', 'medium', 'hard');


CREATE TABLE problems (
    id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    slug TEXT NOT NULL UNIQUE 
       CONSTRAINT problems_slug_format CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND char_length(slug) <= 100),

    difficulty difficulty NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


CREATE TABLE problem_languages (
    problem_id INT  NOT NULL REFERENCES problems(id) ON DELETE CASCADE,
    language language NOT NULL,
    starter_code TEXT NOT NULL,
    reference_solution TEXT NOT NULL,
    PRIMARY KEY (problem_id, language)
);
-- migrate:down

DROP TABLE problem_languages;
DROP TABLE problems;
DROP TYPE language;
DROP TYPE difficulty;