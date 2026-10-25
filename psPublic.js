// Graderoom opens /public/#graderoom: starting the sign-in from this page keeps it same-site,
// which BCP's human check needs to accept its cookie
if (location.hash === '#graderoom') location.replace('/student/idp?_userTypeHint=student');
