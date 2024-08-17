# gunicorn.conf.py
# Non logging stuff
bind = "unix:/run/gunicorn.sock"
workers = 3
# Access log - records incoming HTTP requests
accesslog = "-"
# Error log - records Gunicorn server goings-on
errorlog = "-"
# Whether to send Django output to the error log
capture_output = True
# How verbose the Gunicorn error logs should be
loglevel = "info"
