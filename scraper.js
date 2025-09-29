async function getWithRetries(url, failOnRedirect = false) {
    let initialWaitTime = 2; // seconds
    let waitTime = initialWaitTime;

    let response;

    while (true) {
        await fetch(url, {
            method: 'GET', redirect: failOnRedirect ? 'error' : 'follow', signal: AbortSignal.timeout(10000), // 10 seconds timeout
        }).then((_response) => response = _response)
            .catch(() => response = null);

        if (response === null) {
            return null;
        }

        if (response.status === 429) {
            console.log(`Graderoom is ${waitTime > initialWaitTime ? 'still ' : ''}being rate-limited. Waiting ${waitTime} seconds...`);
            await new Promise(resolve => setTimeout(resolve, waitTime * 1000));
            waitTime += 1;
        } else {
            break;
        }
    }

    if (response.status === 403) {
        console.log('Graderoom is blocked from accessing PowerSchool. Try again later.');
        return null;
    }

    return response; // success case
}

async function postWithRetries(url, data) {
    let initialWaitTime = 2;
    let waitTime = initialWaitTime;

    let response;

    while (true) {
        response = await fetch(url, {
            method: 'POST', body: data, headers: {
                'Content-Type': 'application/json;charset=UTF-8'
            }, signal: AbortSignal.timeout(10000) // 10 seconds timeout
        });

        if (response.status === 429) {
            console.log(`Graderoom is ${waitTime > initialWaitTime ? 'still ' : ''}being rate-limited. Waiting ${waitTime} seconds...`);
            await new Promise(resolve => setTimeout(resolve, waitTime * 1000));
            waitTime += 1;
        } else {
            break;
        }
    }

    if (response.status === 403) {
        console.log('Graderoom is blocked from accessing PowerSchool. Try again later.');
        return null;
    }

    return response;
}

async function getClass(localClass) {
    let now = new Date();
    let startDate = JSON.stringify(`${now.getFullYear() - 4}-01-01`);
    let endDate = JSON.stringify(`${now.getFullYear() + 4}-01-01`);

    let data = `{"section_ids":[${localClass.section_id}],"student_ids":[${localClass.student_id}],"start_date":${startDate},"end_date":${endDate}}`;

    let url = `https://powerschool.bcp.org/ws/xte/assignment/lookup?_=`;
    return await postWithRetries(url, data);
}

async function parsePSClass(localClass, rawData) {
    function stripper(info) {
        if (!('_assignmentsections' in info)) {
            return;
        }

        let psaid = info['assignmentid'];
        let _data = info['_assignmentsections'][0];

        let description = false;
        if ('description' in _data) {
            description = _data['description'];
        }

        let date = _data['duedate'].replaceAll('-', '/');
        date = `${date.substring(5)}/${date.substring(0, 4)}`;

        let sortDate = new Date(date).getTime();
        let category = _data['_assignmentcategoryassociations'][0]['_teachercategory']['name'];
        let assignmentName = _data['name'];
        let exclude = !_data['iscountedinfinalgrade'];

        let pointsPossible = false;
        if ('totalpointvalue' in _data && (typeof _data['totalpointvalue'] === 'number')) {
            pointsPossible = _data['totalpointvalue'];
        }

        let pointsGotten = false;
        let gradePercent = false;
        let comment = false;
        if (_data['_assignmentscores'].length) {
            let scoreData = _data['_assignmentscores'][0];
            exclude ||= scoreData['isexempt'];

            if ('scorepoints' in scoreData) {
                pointsGotten = scoreData['scorepoints'];
                if ('weight' in _data) {
                    pointsGotten *= _data['weight'];
                }
            }

            if ('scorepercent' in scoreData) {
                gradePercent = Math.round(scoreData['scorepercent'] * 100) / 100;
            }

            if ('_assignmentscorecomment' in scoreData) {
                comment = scoreData['_assignmentscorecomment']['commentValue'];
            }
        }

        return {
            'date': date,
            'sort_date': sortDate,
            'category': category,
            'assignment_name': assignmentName,
            'exclude': exclude,
            'points_possible': pointsPossible,
            'points_gotten': pointsGotten,
            'grade_percent': gradePercent,
            'psaid': psaid,
            'description': description,
            'comment': comment,
        };
    }

    function removeEmpty(value) {
        return value !== null;
    }

    let raw = await rawData.json();

    localClass.grades = raw.map(stripper).filter(removeEmpty).sort((a, b) => a.sort_date - b.sort_date);
    localClass.grades = localClass.grades.map(grade => {
        delete grade.sort_date;
        return grade;
    });

    return localClass;
}

async function scrapeClass(url, allClasses, overallPercent, overallLetter) {
    let gradesResp = await getWithRetries(url);
    let gradesText = await gradesResp.text();
    let parser = new DOMParser();
    let gradesDoc = parser.parseFromString(gradesText, 'text/html');

    let classTables = gradesDoc.querySelectorAll('table');
    let infoTable = classTables[0];

    let infoRow = infoTable.querySelectorAll('tr')[1];
    let infoData = infoRow.querySelectorAll('td');
    let className = infoData[0].textContent;
    let teacherName = infoData[1].textContent;

    if (!className || !teacherName || overallPercent === null || overallLetter === null) {
        return false;
    }

    let wrapper = gradesDoc.querySelector('div.xteContentWrapper');
    let sectionId = wrapper.querySelector('div').getAttribute('data-sectionid');
    let studentId = wrapper.getAttribute('data-ng-init').split(';')[0].split('\'')[1].substring(3);

    let localClass = {
        'class_name': className,
        'teacher_name': teacherName,
        'overall_percent': overallPercent,
        'overall_letter': overallLetter,
        'student_id': studentId,
        'section_id': sectionId,
        'ps_locked': false,
        'grades': [],
    };

    localClass = await parsePSClass(localClass, await getClass(localClass));

    allClasses.push(localClass);
    return true;
}

async function getTermAndSemesterData() {
    let url = `https://powerschool.bcp.org/guardian/myschedulematrix.html`;
    let resp = await getWithRetries(url);

    let text = await resp.text();
    let parser = new DOMParser();
    let doc = parser.parseFromString(text, 'text/html');

    let table = doc.querySelector('table');
    if (!table) {
        return {term: null, semester: null};
    }

    let tableCells = table.querySelectorAll('td');
    let term = tableCells[0].textContent;
    let semester = tableCells[1].textContent;

    if (term.startsWith('SS')) {
        semester = 'S0';
        let startYear = parseInt(term.substring(4)) - 1;
        let endYear = startYear + 1;
        term = `${startYear}-${endYear}`;
    }

    semester = semester === 'S0' ? 'S3' : semester;

    return {term, semester};
}

export async function getPresentOrLocked(classData, termData, port) {
    let url = 'https://powerschool.bcp.org/guardian/termgrades.html';
    let resp = await getWithRetries(url, true);

    if (resp === null) {
        console.log('Not logged in.');
        return {success: false, message: 'Not logged in.'};
    }

    let text = await resp.text();
    let parser = new DOMParser();
    let doc = parser.parseFromString(text, 'text/html');

    let lockedMsg = doc.querySelector('div.feedback-note');

    if (lockedMsg && lockedMsg.textContent === 'Display of final grades has been disabled by your school.') {
        port.postMessage({type: 'status', message: 'PowerSchool is locked.'});
        port.postMessage({type: 'status', message: 'Getting data from locked PowerSchool...'});
        console.log('PowerSchool is locked.');
        console.log('Getting data from locked PowerSchool...');
        return await getLocked(classData, termData, port);
    }

    return await getPresent(port);
}

async function getPresent(port) {
    let url = `https://powerschool.bcp.org/guardian/home.html`;
    let resp = await getWithRetries(url, true);

    if (resp === null) {
        console.log('Not logged in.');
        return {success: false, message: 'Not logged in.'};
    }

    let progress = 35;
    port.postMessage({type: 'status', message: 'Searching for courses...', progress});
    console.log('Searching for courses...');

    let text = await resp.text();
    let parser = new DOMParser();
    let doc = parser.parseFromString(text, 'text/html');

    let allClasses = [];

    let mainTableRows = doc.querySelectorAll('table.linkDescList.grid tr');
    let classRows = [];

    for (let row of mainTableRows) {
        if (row.hasAttribute('class') && row.getAttribute('class') === 'center') {
            classRows.push(row);
        }
    }

    let totalCourseCount = classRows.length;
    let scrapedCourseCount = 0;

    let initialProgress = progress;
    let maxProgress = 90;
    progress = initialProgress + (maxProgress - initialProgress) * scrapedCourseCount / (totalCourseCount === 0 ? 1 : totalCourseCount);

    port.postMessage({
        type: 'status', message: `Synced ${scrapedCourseCount} of ${totalCourseCount} courses...`, progress
    });
    console.log(`Synced ${scrapedCourseCount} of ${totalCourseCount} courses...`);

    for (let classRow of classRows) {
        let assignmentsLink = null;
        let overallPercent = null;
        let overallLetter = null;

        let links = classRow.querySelectorAll('a');
        for (let link of links) {
            if (((link.hasAttribute('class') && link.getAttribute('class') === 'bold') || link.textContent === '[ i ]') && link.getAttribute('href').substring(0, 5) === 'score') {
                let semester = link.getAttribute('href').split('&fg=')[1].substring(0, 2);
                if (semester.startsWith('Q')) continue;

                assignmentsLink = link.getAttribute('href');

                let letterAndPercent = link.textContent;
                if (letterAndPercent === '[ i ]') {
                    overallLetter = false;
                    overallPercent = false;
                } else {
                    for (let i = 0; i < letterAndPercent.length; i++) {
                        let charac = letterAndPercent[i];
                        if (charac >= '0' && charac <= '9') {
                            overallLetter = letterAndPercent.substring(0, i);
                            overallPercent = parseFloat(letterAndPercent.substring(i));
                            break;
                        }
                    }
                }
            }
        }

        if (assignmentsLink === null) {
            totalCourseCount--;
            progress = initialProgress + (maxProgress - initialProgress) * scrapedCourseCount / (totalCourseCount === 0 ? 1 : totalCourseCount);
            port.postMessage({
                type: 'status', message: `Synced ${scrapedCourseCount} of ${totalCourseCount} courses...`, progress
            });
            console.log(`Synced ${scrapedCourseCount} of ${totalCourseCount} courses...`);
            continue;
        }

        url = `https://powerschool.bcp.org/guardian/${assignmentsLink}`;
        if (await scrapeClass(url, allClasses, overallPercent, overallLetter)) {
            scrapedCourseCount++;
        } else {
            totalCourseCount--;
        }

        progress = initialProgress + (maxProgress - initialProgress) * scrapedCourseCount / (totalCourseCount === 0 ? 1 : totalCourseCount);
        port.postMessage({type: 'status', message: `Synced ${scrapedCourseCount} of ${totalCourseCount} courses...`, progress});
        console.log(`Synced ${scrapedCourseCount} of ${totalCourseCount} courses...`);
    }

    progress = 95;
    port.postMessage({type: 'status', message: 'Fetching term and semester data...', progress});
    let {term, semester} = await getTermAndSemesterData();

    if (term === null || semester === null) {
        return {success: false, message: 'Error getting term and semester data'};
    }

    if (allClasses.length === 0) {
        port.postMessage({type: 'status', message: 'No class data.', progress: 0});
        return {success: false, message: 'No class data.'};
    }

    port.postMessage({type: 'status', message: 'Sync Complete!', progress: 100});
    console.log('Sync Complete!');
    return {success: true, data: {[term]: {[semester]: allClasses}}};
}

export async function getHistory(port) {
    let url = 'https://powerschool.bcp.org/guardian/termgrades.html';
    let resp = await getWithRetries(url, true);

    if (resp === null) {
        console.log('Not logged in.');
        return {success: false, message: 'Not logged in.'};
    }

    let progress = 35;

    port.postMessage({type: 'status', message: 'Searching for courses...', progress});
    console.log('Searching for courses...');

    let text = await resp.text();
    let parser = new DOMParser();
    let doc = parser.parseFromString(text, 'text/html');

    let allHistory = {};

    let yearList = doc.querySelector('ul.tabs');
    let yearLinks = yearList.querySelectorAll('li');

    let totalTermCount = yearLinks.length;
    let scrapedTermCount = 0;

    let initialProgress = progress;
    let maxProgress = 100;
    progress = initialProgress + (maxProgress - initialProgress) * scrapedTermCount / (totalTermCount === 0 ? 1 : totalTermCount);

    port.postMessage({type: 'status', message: `Synced ${scrapedTermCount} of ${totalTermCount} terms...`, progress});
    console.log(`Synced ${scrapedTermCount} of ${totalTermCount} terms...`);

    for (let yearLink of yearLinks) {
        let link = yearLink.querySelector('a');
        if ('SS' in link.textContent) {
            totalTermCount--;
            progress = initialProgress + (maxProgress - initialProgress) * scrapedTermCount / (totalTermCount === 0 ? 1 : totalTermCount);
            port.postMessage({
                type: 'status', message: `Synced ${scrapedTermCount} of ${totalTermCount} terms...`, progress
            });
            console.log(`Synced ${scrapedTermCount} of ${totalTermCount} terms...`);
            continue;
        }

        let year = yearLink.textContent.trim().substring(0, 5);

        if (!yearLink.getAttribute('href')) {
            totalTermCount--;
            progress = initialProgress + (maxProgress - initialProgress) * scrapedTermCount / (totalTermCount === 0 ? 1 : totalTermCount);
            port.postMessage({
                type: 'status', message: `Synced ${scrapedTermCount} of ${totalTermCount} terms...`, progress
            });
            console.log(`Synced ${scrapedTermCount} of ${totalTermCount} terms...`);
            continue;
        }

        url = `https://powerschool.bcp.org/guardian/${link.getAttribute('href')}`;
        text = await resp.text();
        doc = parser.parseFromString(text, 'text/html');

        let mainTable = doc.querySelector('table');
        let mainTableRows = mainTable.querySelectorAll('tr');

        let title = '';
        let semesterClasses = [];
        let yearData = {};

        for (let row of mainTableRows) {
            let th = row.querySelector('th');
            if (th?.textContent in ['S0', 'S1', 'S2']) {
                if (semesterClasses.length > 0) {
                    yearData[title === 'S0' ? 'S3' : title] = semesterClasses;
                }

                title = th.textContent;
                semesterClasses = [];
            }

            if (title !== '' && row.querySelector('td.table-element-text-align-start')) {
                let data = row.querySelectorAll('td');

                let className = cleanString(data[0].textContent);
                let overallLetter = cleanString(data[1].textContent);
                let overallPercent = cleanNumber(data[2].textContent);

                if (row.querySelector('a')) {
                    url = `https://powerschool.bcp.org/guardian/${row.querySelector('a').getAttribute('href')}`;
                    await scrapeClass(url, semesterClasses, overallPercent, overallLetter);
                } else {
                    let localClass = {
                        'class_name': className,
                        'teacher_name': false,
                        'overall_percent': overallPercent,
                        'overall_letter': overallLetter,
                        'student_id': false,
                        'section_id': false,
                        'ps_locked': false,
                        'grades': [],
                    };

                    semesterClasses.push(localClass);
                }
            }
        }

        if (title !== '') {
            yearData[title === 'S0' ? 'S3' : title] = semesterClasses;
            allHistory[year] = yearData;
            scrapedTermCount++;
        } else {
            scrapedTermCount--;
        }

        progress = initialProgress + (maxProgress - initialProgress) * scrapedTermCount / (totalTermCount === 0 ? 1 : totalTermCount);
        port.postMessage({type: 'status', message: `Synced ${scrapedTermCount} of ${totalTermCount} terms...`});
        console.log(`Synced ${scrapedTermCount} of ${totalTermCount} terms...`);
    }

    if (isEmptyObject(allHistory)) {
        console.log('No class data.');
        return {success: false, message: 'No class data.'};
    }

    console.log('Get History Complete!');
    return {success: true, data: allHistory};
}

async function getLocked(classData, termData, port) {
    let url = 'https://powerschool.bcp.org/guardian/teachercomments.html';
    let resp = await getWithRetries(url, true);

    if (resp === null) {
        console.log('Not logged in.');
        return {success: false, message: 'Not logged in.'};
    }

    let progress = 10;
    port.postMessage({type: 'status', message: 'Fetching course data...', progress});
    console.log('Fetching course data...');

    let text = await resp.text();
    let parser = new DOMParser();
    let doc = parser.parseFromString(text, 'text/html');

    let table = doc.querySelector('table.grid.linkDescList');
    let courses = table.querySelectorAll('tr');
    let classNames = Array.from(courses).slice(1).map((course) => course.querySelectorAll('td')[2].textContent);

    let dataWeHave = (classData || []).filter((d) => typeof d['student_id'] === 'number' && typeof d['section_id'] === 'number');
    let useNewData = dataWeHave.length === 0;

    let newClassData = [];

    progress = 15;

    let studentId;
    if (!useNewData) {
        studentId = dataWeHave[0].student_id;
    } else {
        port.postMessage({type: 'status', message: 'Fetching student id...', progress});
        console.log('Fetching student id...');
        url = 'https://powerschool.bcp.org/guardian/forms.html';
        resp = await getWithRetries(url);

        text = await resp.text();
        doc = parser.parseFromString(text, 'text/html');

        studentId = doc.querySelector('div#content-main').textContent.split('studentdcid = \'')[1].split('\'')[0];
    }

    progress = 20;

    if (useNewData) {
        port.postMessage({type: 'status', message: 'No existing course data. Syncing all courses...', progress});
        console.log('No existing course data. Syncing all courses...');
    }

    let term = null;
    let semester = null;
    if (termData !== null) {
        progress = 25;
        port.postMessage({type: 'status', message: 'Fetching terms...', progress});
        let {_term, _semester} = await getTermAndSemesterData();
        if (termData['term'] !== _term) {
            useNewData = true;
            term = _term;
            semester = _semester;
        }
    }

    if (useNewData) {
        port.postMessage({type: 'status', message: 'Checking for new course data...', progress});
        console.log('Checking for new course data...');
        for (let i = 0; i < classNames.length; i++) {
            let initialProgress = progress;
            let maxProgress = 35;
            progress = initialProgress + (maxProgress - initialProgress) * (i + 1) / classNames.length;
            port.postMessage({type: 'status', message: `Found new course ${classNames[i]}`, progress});
            console.log(`Found new course ${classNames[i]}`);
            let course = courses[i + 1];
            let teacherName = course.querySelectorAll('td')[3].querySelectorAll('a')[1].textContent.split('Email ')[1];
            let sectionIdDiv = course.querySelectorAll('td[align=center]')[0];
            let sectionId = sectionIdDiv.childNodes[1].data.split(' ')[2];

            newClassData.push({
                'class_name': classNames[i],
                'teacher_name': teacherName,
                'overall_percent': false,
                'overall_letter': false,
                'student_id': studentId,
                'section_id': sectionId,
            });
        }

        if (term === null || semester === null) {
            let termAndSemester = await getTermAndSemesterData();
            term = termAndSemester.term;
            semester = termAndSemester.semester;
        }

        if (term === null || semester === null) {
            if (termData === null) {
                return {success: false, message: 'Error getting term and semester data'};
            }
        } else {
            termData = {
                term: term, semester: semester
            };
        }
    } else {
        newClassData = dataWeHave;
        if (termData === null) {
            return {success: false, message: 'Error getting term and semester data'};
        }
    }

    classData = newClassData;

    let allClasses = [];
    let totalCourseCount = classData.length;
    let scrapedCourseCount = 0;

    let initialProgress = progress;
    let maxProgress = 90;
    progress = initialProgress + (maxProgress - initialProgress) * scrapedCourseCount / (totalCourseCount === 0 ? 1 : totalCourseCount);

    port.postMessage({type: 'status', message: `Synced ${scrapedCourseCount} of ${totalCourseCount} courses...`, progress});
    console.log(`Synced ${scrapedCourseCount} of ${totalCourseCount} courses...`);

    for (let data of classData) {
        let className = data['class_name'];
        let teacherName = data['teacher_name'];
        let overallPercent = data['overall_percent'];
        let overallLetter = data['overall_letter'];
        let studentId = data['student_id'];
        let sectionId = data['section_id'];
        let localClass = {
            'class_name': className,
            'teacher_name': teacherName,
            'overall_percent': overallPercent,
            'overall_letter': overallLetter,
            'student_id': studentId,
            'section_id': sectionId,
            'ps_locked': true,
            'grades': [],
        };

        localClass = await parsePSClass(localClass, await getClass(localClass));
        allClasses.push(localClass);
        scrapedCourseCount++;
        progress = initialProgress + (maxProgress - initialProgress) * scrapedCourseCount / (totalCourseCount === 0 ? 1 : totalCourseCount);
        port.postMessage({type: 'status', message: `Synced ${scrapedCourseCount} of ${totalCourseCount} courses...`, progress});
        console.log(`Synced ${scrapedCourseCount} of ${totalCourseCount} courses...`);
    }

    progress = 95;
    port.postMessage({type: 'status', message: 'Fetching term and semester data...', progress});
    console.log('Fetching term and semester data...');
    term = termData.term;
    semester = termData.semester;

    if (allClasses.length > 0) {
        port.postMessage({type: 'status', message: 'Sync Complete!', progress: 100});
        console.log('Sync Complete!');
        return {success: true, data: {[term]: {[semester]: allClasses}}};
    }

    port.postMessage({type: 'status', message: 'No class data.', progress: 0});
    console.log('No class data.');
    return {success: false, message: 'No class data.'};
}

function cleanString(str) {
    str = str.trim();
    if (str === '') {
        return false;
    }

    return str;
}

function cleanNumber(str) {
    str = str.trim();
    try {
        str = parseFloat(str);
        return str;
    } catch (e) {
        return false;
    }
}

function isEmptyObject(value) {
    return (typeof value === 'object' && // Ensure it's an object (not null or a primitive)
        value !== null && // Exclude null
        !Array.isArray(value) && // Exclude arrays
        Object.keys(value).length === 0 // Check if it has no enumerable properties
    );
}
