alter table opportunities drop constraint if exists opportunities_recommended_format_check;
alter table opportunities add constraint opportunities_recommended_format_check
  check (recommended_format is null or recommended_format in ('LONG_HORIZONTAL','SHORT_HORIZONTAL','SHORT_VERTICAL','HYBRID'));
