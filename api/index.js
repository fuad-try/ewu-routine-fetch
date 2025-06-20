// Import necessary modules
const axios = require('axios');
const cheerio = require('cheerio');

// Define your constants
const portal_url = 'https://portal.ewubd.edu/';
const profile_api_url = 'https://portal.ewubd.edu/Advising/StudentAdvisingCourseListApi';

module.exports = async (req, res) => {
    // Set appropriate headers for the API response
    res.setHeader('Content-Type', 'application/json; charset=UTF-8');

    // Handle missing credentials
    if (req.method === 'GET' && (!req.query.username || !req.query.password)) {
        return res.status(400).json({
            error: "Missing Credentials",
            message: "Please provide both 'username' and 'password' as query parameters.",
            example: `${req.headers.host}${req.url}?username=YOUR_STUDENT_ID&password=YOUR_PASSWORD`
        });
    } else if (req.method === 'POST' && (!req.body.username || !req.body.password)) {
        return res.status(400).json({
            error: "Missing Credentials",
            message: "Please provide both 'username' and 'password' as POST parameters."
        });
    }

    const username = req.method === 'GET' ? req.query.username : req.body.username;
    const password = req.method === 'GET' ? req.query.password : req.body.password;

    try {
        // --- Step 1: Perform GET request to get captcha and session cookies ---
        const getResponse = await axios.get(portal_url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Mobile Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
                'Accept-Encoding': 'gzip, deflate, br, zstd',
                'Cache-Control': 'max-age=0',
                'sec-ch-ua': '"Chromium";v="136", "Google Chrome";v="136", "Not.A/Brand";v="99"',
                'sec-ch-ua-mobile': '?1',
                'sec-ch-ua-platform': '"Android"',
                'save-data': 'on',
                'Upgrade-Insecure-Requests': '1',
                'Sec-Fetch-Site': 'none',
                'Sec-Fetch-Mode': 'navigate',
                'Sec-Fetch-User': '?1',
                'Sec-Fetch-Dest': 'document',
                'Accept-Language': 'en-US,en;q=0.9,bn;q=0.8'
            },
            // Axios automatically handles cookies in subsequent requests if you use a cookie jar,
            // or you can manually extract and set them as shown below.
            // For simplicity, let's manually extract cookies here.
            validateStatus: function (status) {
                return status >= 200 && status < 300; // Resolve only if status is in this range
            }
        });

        // Extract cookies from Set-Cookie header
        const setCookieHeaders = getResponse.headers['set-cookie'];
        let cookieString = '';
        if (setCookieHeaders) {
            cookieString = setCookieHeaders.map(cookie => cookie.split(';')[0].trim()).join('; ');
        }

        const $ = cheerio.load(getResponse.data);

        const num1 = parseInt($('#lblFirstNo').text().trim());
        const op = $('#lblplus').text().trim();
        const num2 = parseInt($('#lblSecondNo').text().trim());

        let calculated_answer = null;
        if (!isNaN(num1) && !isNaN(num2)) {
            switch (op) {
                case '+':
                    calculated_answer = num1 + num2;
                    break;
                case '-':
                    calculated_answer = num1 - num2;
                    break;
                default:
                    return res.status(500).json({ error: "Captcha Operator Not Supported", message: "An unexpected captcha format was encountered." });
            }
        } else {
            return res.status(500).json({ error: "Could Not Extract Captcha Numbers", message: "Failed to parse the captcha. The portal's structure might have changed." });
        }

        if (calculated_answer === null || !cookieString) {
            return res.status(500).json({ error: "Failed to prepare login data.", message: "Could not gather all necessary information for login." });
        }

        // --- Step 2: Perform POST request for login ---
        const postData = new URLSearchParams({
            Username: username,
            Password: password,
            Answer: calculated_answer,
            FirstNo: num1,
            SecondNo: num2,
        }).toString();

        const postResponse = await axios.post(portal_url, postData, {
            headers: {
                'Host': 'portal.ewubd.edu',
                'Connection': 'keep-alive',
                'Content-Length': postData.length,
                'Cache-Control': 'max-age=0',
                'sec-ch-ua': '"Chromium";v="136", "Google Chrome";v="136", "Not.A/Brand";v="99"',
                'sec-ch-ua-mobile': '?1',
                'sec-ch-ua-platform': '"Android"',
                'save-data': 'on',
                'Origin': 'https://portal.ewubd.edu',
                'Content-Type': 'application/x-www-form-urlencoded',
                'Upgrade-Insecure-Requests': '1',
                'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Mobile Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
                'Sec-Fetch-Site': 'same-origin',
                'Sec-Fetch-Mode': 'navigate',
                'Sec-Fetch-User': '?1',
                'Sec-Fetch-Dest': 'document',
                'Referer': 'https://portal.ewubd.edu/',
                'Accept-Encoding': 'gzip, deflate, br, zstd',
                'Accept-Language': 'en-US,en;q=0.9,bn;q=0.8',
                'Cookie': cookieString // Use cookies from the GET request
            },
            maxRedirects: 0, // Prevent axios from following redirects automatically, we want to capture the cookies before redirect
            validateStatus: function (status) {
                return status >= 200 && status < 303; // Allow 2xx and 302/303 for redirects
            }
        });

        // Update cookies after login POST, if there are new ones or changes
        const postSetCookieHeaders = postResponse.headers['set-cookie'];
        if (postSetCookieHeaders) {
            cookieString = postSetCookieHeaders.map(cookie => cookie.split(';')[0].trim()).join('; ');
        }
        // If the portal redirects on successful login, you might need to handle the Location header
        // and re-send the request to the redirected URL with the updated cookies.
        // For simplicity, assuming the cookie string from the POST response is sufficient.

        // --- Step 3: Access the Student Advising Course List API ---
        const profileApiResponse = await axios.get(profile_api_url, {
            headers: {
                'Host': 'portal.ewubd.edu',
                'Connection': 'keep-alive',
                'Cache-Control': 'no-cache',
                'X-Requested-With': 'XMLHttpRequest',
                'sec-ch-ua': '"Chromium";v="136", "Google Chrome";v="136", "Not.A/Brand";v="99"',
                'sec-ch-ua-mobile': '?1',
                'sec-ch-ua-platform': '"Android"',
                'Origin': 'https://portal.ewubd.edu',
                'Referer': 'https://portal.ewubd.edu/Advising/AdvisingList',
                'Accept': 'application/json, text/plain, */*',
                'Accept-Encoding': 'gzip, deflate, br, zstd',
                'Accept-Language': 'en-US,en;q=0.9,bn;q=0.8',
                'Cookie': cookieString // Pass the session cookies here!
            }
        });

        const profile_data = profileApiResponse.data;

        // --- Process and Output the API Response ---
        const day_map = {
            'M': 'Monday',
            'S': 'Sunday',
            'W': 'Wednesday',
            'T': 'Tuesday',
            'R': 'Thursday',
        };

        const routine = {
            "Sunday": [],
            "Monday": [],
            "Tuesday": [],
            "Wednesday": [],
            "Thursday": [],
            "Friday": [],
            "Saturday": []
        };

        profile_data.forEach(course => {
            const time_slot_name = course.TimeSlotName;
            const matches = time_slot_name.match(/^([A-Z]+)\s/);
            const day_codes = matches ? matches[1] : '';
            const time = time_slot_name.replace(/^[A-Z]+\s/, '');
            const course_type = (course.CourseCode && course.CourseCode.toLowerCase().includes('lab')) ? 'Lab' : 'Theory';

            const individual_day_codes = day_codes.split('');
            individual_day_codes.forEach(day_code => {
                if (day_map[day_code]) {
                    const full_day_name = day_map[day_code];
                    const course_details = {
                        "CourseCode": course.CourseCode,
                        "CourseType": course_type,
                        "Section": course.SectionName,
                        "Faculty": course.FacultyName,
                        "ShortName": course.ShortName,
                        "Email": course.Email,
                        "Time": time,
                        "Room": course.RoomName
                    };
                    routine[full_day_name].push(course_details);
                }
            });
        });

        res.status(200).json(routine);

    } catch (error) {
        console.error("Error:", error.message);
        if (error.response) {
            console.error("Error response data:", error.response.data);
            console.error("Error response status:", error.response.status);
            console.error("Error response headers:", error.response.headers);
            return res.status(error.response.status || 500).json({
                error: "API Request Failed",
                message: error.response.data || "An error occurred while fetching data from the portal."
            });
        } else if (error.request) {
            console.error("Error request:", error.request);
            return res.status(500).json({
                error: "No response received",
                message: "The portal did not respond to the request."
            });
        } else {
            return res.status(500).json({
                error: "Error processing request",
                message: error.message
            });
        }
    }
};
