// Thank you, Claude
package imapinterface

type fakeEmail struct {
	subject string
	content string
}

var (
	fakeThreads = [][]fakeEmail{
		{
			{
				subject: "This is a subject",
				content: "This is the content",
			},
			{
				subject: "This is a reply",
				content: "This is the reply content",
			},
		},
		{
			{
				subject: "Team Meeting - Q3 Planning",
				content: "Hi team,\n\nWe need to schedule our Q3 planning session. Please let me know your availability for next week.\n\nBest,\nSarah",
			},
			{
				subject: "Re: Team Meeting - Q3 Planning",
				content: "Tuesday afternoon works for me. How about 2 PM?\n\n- Mike",
			},
			{
				subject: "Re: Team Meeting - Q3 Planning",
				content: "Tuesday 2 PM is perfect. I'll send out the calendar invite.\n\n- Sarah",
			},
		},
		{
			{
				subject: "Server Maintenance Window",
				content: "This is to inform you that we will be performing scheduled maintenance on our servers this Saturday from 2 AM to 6 AM EST. Please plan accordingly.\n\nIT Operations Team",
			},
		},
		{
			{
				subject: "Budget Proposal Review",
				content: "Please find attached the budget proposal for the upcoming fiscal year. I need your review and feedback by Friday.\n\nThanks,\nJohn",
			},
			{
				subject: "Re: Budget Proposal Review",
				content: "I've reviewed the proposal. The marketing budget seems a bit high. Can we discuss this in tomorrow's meeting?\n\n- Lisa",
			},
		},
		{
			{
				subject: "New Employee Onboarding",
				content: "Welcome to the team! Your first day is Monday, March 15th. Please arrive at 9 AM at the main office reception.\n\nHR Department",
			},
			{
				subject: "Re: New Employee Onboarding",
				content: "Thank you for the information. I'm excited to start! Should I bring any specific documents on my first day?\n\n- Alex",
			},
			{
				subject: "Re: New Employee Onboarding",
				content: "Please bring a photo ID and your signed offer letter. We'll handle the rest during orientation.\n\n- HR Team",
			},
		},
		{
			{
				subject: "Client Presentation Feedback",
				content: "The presentation went well yesterday. The client was impressed with our proposal. They want to schedule a follow-up meeting next week.\n\nGreat job everyone!\n- David",
			},
		},
		{
			{
				subject: "Project Status Update",
				content: "Hi team,\n\nHere's the weekly project status update:\n- Phase 1: Complete\n- Phase 2: 75% complete\n- Phase 3: Starting next week\n\nLet me know if you have any questions.\n\n- Rachel",
			},
			{
				subject: "Re: Project Status Update",
				content: "Thanks for the update. When do we expect Phase 2 to be fully complete?\n\n- Tom",
			},
			{
				subject: "Re: Project Status Update",
				content: "Phase 2 should be complete by end of this week. I'll send another update on Friday.\n\n- Rachel",
			},
			{
				subject: "Re: Project Status Update",
				content: "Perfect, that aligns with our client timeline. Thanks Rachel!\n\n- Tom",
			},
		},
		{
			{
				subject: "Company Holiday Party",
				content: "Save the date! Our annual holiday party will be held on December 15th at the Riverside Hotel. More details to follow.\n\nEvent Planning Committee",
			},
			{
				subject: "Re: Company Holiday Party",
				content: "Sounds great! Will there be vegetarian options available?\n\n- Emma",
			},
		},
		{
			{
				subject: "Software License Renewal",
				content: "Our software licenses expire next month. I need approval to renew them. The total cost is $12,500.\n\nPlease approve at your earliest convenience.\n\n- IT Manager",
			},
		},
		{
			{
				subject: "🚀 Exclusive 50% Off Summer Sale - Limited Time!",
				content: "Don't miss out on our biggest sale of the year! Get 50% off everything in our store. Use code SUMMER50 at checkout. Hurry - offer expires in 48 hours!\n\nShop now at www.dealstore.com",
			},
		},
		{
			{
				subject: "Weekly Newsletter - Tech Updates",
				content: "Here are this week's top tech stories:\n\n• AI breakthrough in medical research\n• New smartphone launches\n• Cryptocurrency market updates\n\nStay informed with TechDaily!",
			},
		},
		{
			{
				subject: "Your Amazon order has shipped",
				content: "Good news! Your order #12345-67890 has been shipped and is on its way to you.\n\nExpected delivery: Tomorrow by 8 PM\nTracking number: 1Z999AA1234567890\n\nTrack your package at amazon.com/tracking",
			},
		},
		{
			{
				subject: "Marketing Campaign Results",
				content: "Hi team,\n\nHere are the results from last week's email campaign:\n- Open rate: 24%\n- Click-through rate: 3.2%\n- Conversions: 127\n\nOverall a successful campaign!\n\n- Marketing Team",
			},
			{
				subject: "Re: Marketing Campaign Results",
				content: "Great results! What was our cost per acquisition for this campaign?\n\n- CEO",
			},
		},
		{
			{
				subject: "💎 VIP Member Exclusive - Early Access Sale",
				content: "As a valued VIP member, you get exclusive early access to our flash sale! 30% off premium products before anyone else.\n\nUse code: VIP30\nValid for the next 24 hours only!\n\nLuxury Fashion Boutique",
			},
		},
		{
			{
				subject: "System Backup Completed",
				content: "Automated system backup completed successfully at 2:00 AM.\n\nBackup size: 2.3 GB\nLocation: /backups/2024-03-15/\nStatus: Success\n\nSystem Administrator",
			},
		},
		{
			{
				subject: "Conference Room Booking Confirmation",
				content: "Your booking has been confirmed:\n\nRoom: Conference Room A\nDate: March 20, 2024\nTime: 10:00 AM - 11:30 AM\nPurpose: Team Standup\n\nFacilities Management",
			},
		},
		{
			{
				subject: "🍕 Free Pizza Friday - Join Us!",
				content: "It's Pizza Friday! Come to the break room at 12:00 PM for free pizza and team bonding.\n\nMenu today:\n- Margherita\n- Pepperoni\n- Vegetarian Supreme\n\nSee you there!\n\nEmployee Relations",
			},
		},
		{
			{
				subject: "📚 Learn Python in 30 Days - Free Course!",
				content: "Master Python programming with our comprehensive free course!\n\n✓ 30 days of structured lessons\n✓ Hands-on projects\n✓ Certificate upon completion\n\nEnroll now at CodeAcademy.com",
			},
		},
		{
			{
				subject: "Expense Report Reminder",
				content: "Friendly reminder that your monthly expense report is due by end of day Friday.\n\nPlease submit all receipts and documentation through the expense portal.\n\nAccounting Department",
			},
		},
		{
			{
				subject: "Performance Review Schedule",
				content: "Your annual performance review has been scheduled:\n\nDate: March 25, 2024\nTime: 2:00 PM\nLocation: Manager's Office\n\nPlease prepare your self-evaluation form beforehand.\n\nHR Team",
			},
			{
				subject: "Re: Performance Review Schedule",
				content: "Thanks for scheduling this. Should I bring any specific documents or examples of my work?\n\n- Employee",
			},
			{
				subject: "Re: Performance Review Schedule",
				content: "Yes, please bring examples of your key achievements from this year and your completed self-evaluation form.\n\n- Manager",
			},
		},
		{
			{
				subject: "🎯 Investment Opportunity - Act Fast!",
				content: "Limited time investment opportunity with guaranteed 15% returns!\n\nMinimum investment: $1,000\nExpected returns: 15% annually\nRisk level: Low\n\nContact our investment advisor today!\n\nWealth Management Inc.",
			},
		},
		{
			{
				subject: "Parking Space Assignment",
				content: "You have been assigned parking space #47 in the main parking garage.\n\nYour parking pass will be ready for pickup at the front desk.\n\nBuilding Management",
			},
		},
		{
			{
				subject: "Training Session: Cybersecurity Awareness",
				content: "Mandatory cybersecurity training session:\n\nDate: March 22, 2024\nTime: 1:00 PM - 2:30 PM\nLocation: Training Room B\n\nAttendance is required for all employees.\n\nIT Security",
			},
		},
		{
			{
				subject: "🌟 Customer Satisfaction Survey",
				content: "We value your feedback! Please take 2 minutes to complete our customer satisfaction survey.\n\nYour responses help us improve our service.\n\nSurvey link: surveymonkey.com/customer-feedback\n\nCustomer Success Team",
			},
		},
		{
			{
				subject: "Database Migration Status",
				content: "Database migration update:\n\nProgress: 65% complete\nEstimated completion: Tomorrow 6 PM\nDowntime: None expected\n\nWill update with final status.\n\n- Database Admin",
			},
		},
		{
			{
				subject: "🎉 Black Friday Mega Sale - 70% Off Everything!",
				content: "Our biggest sale event of the year is here!\n\n🔥 70% off all products\n🚚 Free shipping worldwide\n💳 No minimum purchase required\n\nShop now before everything sells out!\n\nMegaStore Online",
			},
		},
		{
			{
				subject: "Office Supplies Order",
				content: "Please submit your office supply requests by Wednesday.\n\nCommon items available:\n- Pens and pencils\n- Paper and notebooks\n- Printer cartridges\n\nOffice Manager",
			},
			{
				subject: "Re: Office Supplies Order",
				content: "I need 2 boxes of black pens and 1 pack of sticky notes.\n\n- Jennifer",
			},
		},
		{
			{
				subject: "💰 Claim Your $500 Gift Card Now!",
				content: "Congratulations! You've been selected to receive a $500 Amazon gift card!\n\nTo claim your prize:\n1. Click the link below\n2. Complete our short survey\n3. Provide your mailing address\n\nClaim now: giftcard-promo.com/claim\n\nPromo Team",
			},
		},
		{
			{
				subject: "Project Milestone Achieved",
				content: "Congratulations team! We've successfully completed the first major milestone of Project Alpha.\n\nNext steps:\n- Client presentation on Friday\n- Begin Phase 2 development\n- Team celebration dinner next week\n\nGreat work everyone!\n\n- Project Manager",
			},
		},
		{
			{
				subject: "Health Insurance Open Enrollment",
				content: "Open enrollment period starts Monday, March 18th.\n\nImportant dates:\n- Enrollment period: March 18-31\n- Coverage starts: April 1st\n- Information session: March 19 at 3 PM\n\nBenefits Team",
			},
		},
		{
			{
				subject: "🏠 Mortgage Rates at Historic Lows - Apply Today!",
				content: "Don't miss out on record-low mortgage rates!\n\n✓ Rates as low as 2.9% APR\n✓ No application fees\n✓ Quick approval process\n✓ Refinancing available\n\nApply online at BestMortgage.com\n\nFirst National Bank",
			},
		},
		{
			{
				subject: "Server Maintenance Complete",
				content: "Scheduled server maintenance has been completed successfully.\n\nAll systems are now operational.\nNo data loss occurred.\nPerformance improvements implemented.\n\nIT Operations",
			},
		},
		{
			{
				subject: "Team Building Event",
				content: "Join us for our quarterly team building event!\n\nActivity: Bowling and Arcade\nDate: March 30, 2024\nTime: 6:00 PM - 9:00 PM\nLocation: Strike Zone Bowling\n\nFood and drinks provided!\n\nHR Team",
			},
			{
				subject: "Re: Team Building Event",
				content: "Count me in! Do we need to RSVP?\n\n- Mark",
			},
			{
				subject: "Re: Team Building Event",
				content: "Yes please RSVP by March 25th so we can get an accurate headcount for food.\n\n- HR Team",
			},
		},
		{
			{
				subject: "🎓 MBA Program - Transform Your Career!",
				content: "Take your career to the next level with our Executive MBA program!\n\n🎯 Weekend classes available\n🎯 Industry-leading faculty\n🎯 Networking opportunities\n🎯 Financial aid available\n\nSchedule a consultation today!\n\nBusiness School Admissions",
			},
		},
		{
			{
				subject: "Quarterly Budget Review",
				content: "Time for our Q1 budget review meeting.\n\nPlease prepare:\n- Department spending reports\n- Q2 budget projections\n- Any budget concerns or requests\n\nMeeting: March 28 at 10 AM\n\n- Finance Director",
			},
		},
		{
			{
				subject: "New Employee Welcome Package",
				content: "Welcome to the team! Your employee welcome package includes:\n\n- Employee handbook\n- Company laptop\n- Access cards\n- Parking permit\n\nPickup from reception anytime today.\n\nEmployee Services",
			},
		},
		{
			{
				subject: "⚡ Flash Sale - 24 Hours Only!",
				content: "Lightning deal alert! ⚡\n\n24-hour flash sale on electronics:\n📱 Smartphones - 40% off\n💻 Laptops - 35% off\n🎧 Headphones - 50% off\n\nHurry - limited quantities!\n\nElectronics Warehouse",
			},
		},
		{
			{
				subject: "API Documentation Update",
				content: "The API documentation has been updated with new endpoints and examples.\n\nChanges include:\n- Authentication improvements\n- New rate limiting info\n- Updated code samples\n\nView at docs.api.company.com\n\n- Development Team",
			},
		},
		{
			{
				subject: "Office Temperature Complaint",
				content: "Multiple complaints about office temperature being too cold.\n\nWe're adjusting the HVAC system and should see improvements by tomorrow.\n\nBuilding Maintenance",
			},
			{
				subject: "Re: Office Temperature Complaint",
				content: "Thank you for addressing this quickly. The temperature is much better today.\n\n- Sarah from Accounting",
			},
		},
		{
			{
				subject: "🍔 Food Truck Friday - Gourmet Burgers!",
				content: "This Friday's food truck is serving gourmet burgers!\n\nMenu highlights:\n🍔 Classic Cheeseburger\n🍔 BBQ Bacon Burger\n🍔 Veggie Black Bean Burger\n\nParking lot 11:30 AM - 1:30 PM\n\nEmployee Activities Committee",
			},
		},
		{
			{
				subject: "Code Review Request",
				content: "Please review my pull request for the user authentication module.\n\nPR #247: Enhanced login security\nFiles changed: 12\nLines added: 156\n\nThanks!\n\n- Junior Developer",
			},
			{
				subject: "Re: Code Review Request",
				content: "Reviewed and approved! Great work on the input validation. Just one minor suggestion about error handling.\n\n- Senior Developer",
			},
		},
		{
			{
				subject: "🎈 Kids Birthday Party Supplies - 50% Off!",
				content: "Make your child's birthday magical! 🎉\n\n50% off all party supplies:\n🎈 Balloons and decorations\n🎂 Party favors\n🎪 Themed party kits\n\nFree same-day delivery available!\n\nParty Central",
			},
		},
		{
			{
				subject: "Client Meeting Notes",
				content: "Meeting notes from today's client call:\n\n- Approved Phase 1 deliverables\n- Requested changes to UI design\n- Budget increase approved\n- Next meeting: April 2nd\n\nFull notes attached.\n\n- Account Manager",
			},
		},
		{
			{
				subject: "Printer Replacement",
				content: "The printer in Conference Room C will be replaced tomorrow morning.\n\nReplacement time: 9 AM - 11 AM\nRoom will be unavailable during installation\n\nNew printer features wireless printing.\n\nIT Support",
			},
		},
		{
			{
				subject: "🏆 Win a Free Vacation - Enter Now!",
				content: "Enter our contest for a chance to win a free 7-day Caribbean vacation!\n\n🏝️ All-inclusive resort\n✈️ Flights included\n🍹 Food and drinks covered\n\nEnter at: vacation-contest.com\nDeadline: March 31st\n\nTravel Adventures Inc.",
			},
		},
		{
			{
				subject: "Security Badge Renewal",
				content: "Your security badge expires next month. Please schedule a renewal appointment.\n\nRequired documents:\n- Photo ID\n- Current badge\n- Completed renewal form\n\nSecurity Office hours: 8 AM - 5 PM\n\nSecurity Department",
			},
		},
		{
			{
				subject: "Weekly Time Sheet Reminder",
				content: "Reminder to submit your timesheet by end of day Friday.\n\nMissing timesheets may delay payroll processing.\n\nSubmit at: timesheet.company.com\n\nPayroll Department",
			},
		},
		{
			{
				subject: "💻 Learn Web Development - Free Bootcamp!",
				content: "Join our 12-week intensive web development bootcamp!\n\n✅ HTML, CSS, JavaScript\n✅ React and Node.js\n✅ Job placement assistance\n✅ 100% online or in-person\n\nLimited spots available!\n\nTech Bootcamp Academy",
			},
		},
		{
			{
				subject: "Fire Drill Schedule",
				content: "Monthly fire drill scheduled for tomorrow at 2 PM.\n\nAll employees must evacuate immediately when alarm sounds.\nMeet at designated assembly point in parking lot.\n\nSafety Coordinator",
			},
		},
		{
			{
				subject: "🎵 Music Streaming - 3 Months Free!",
				content: "Experience premium music streaming at no cost!\n\n🎶 50 million songs ad-free\n🎶 Offline downloads\n🎶 High-quality audio\n🎶 Multiple device support\n\nStart your free trial: MusicStream.com\n\nMusicStream Premium",
			},
		},
		{
			{
				subject: "Vendor Payment Approved",
				content: "Payment to TechSupplies Inc. has been approved and processed.\n\nAmount: $15,750.00\nInvoice #: TS-2024-0356\nPayment method: Bank transfer\n\nPayment will arrive in 2-3 business days.\n\nAccounts Payable",
			},
		},
		{
			{
				subject: "Employee Referral Program",
				content: "Refer a qualified candidate and earn a $1,000 bonus!\n\nProgram details:\n- Bonus paid after 90 days\n- Must be external candidate\n- Position must be filled\n\nSubmit referrals to HR.\n\nHuman Resources",
			},
		},
		{
			{
				subject: "🏋️ Gym Membership - Join Today & Save 40%!",
				content: "Transform your fitness journey with our state-of-the-art facilities!\n\n💪 Modern equipment\n💪 Personal training available\n💪 Group fitness classes\n💪 Swimming pool and sauna\n\n40% off first year membership!\n\nFitness First Gym",
			},
		},
		{
			{
				subject: "Office Supply Delivery",
				content: "Your office supply order has been delivered to the mailroom.\n\nOrder #: OS-2024-0892\nItems: Paper, pens, folders\nDelivery time: 10:30 AM\n\nPlease pick up at your convenience.\n\nMailroom Services",
			},
		},
		{
			{
				subject: "🛒 Online Shopping Deals - Up to 60% Off!",
				content: "Massive savings on thousands of products!\n\n🛍️ Fashion - 60% off\n🛍️ Electronics - 45% off  \n🛍️ Home & Garden - 50% off\n🛍️ Sports & Outdoors - 40% off\n\nFree shipping on orders over $50!\n\nShopMart Online",
			},
		},
		{
			{
				subject: "Meeting Room Booking Change",
				content: "Your meeting room booking has been updated:\n\nOriginal: Conference Room B, 2 PM\nNew: Conference Room A, 2 PM\n\nDate remains the same: March 21st\nReason: Room B has A/V issues\n\nFacilities Team",
			},
		},
		{
			{
				subject: "🎨 Art Supplies Sale - Creative Minds Rejoice!",
				content: "Unleash your creativity with our art supply sale!\n\n🎨 Paints and brushes - 30% off\n🎨 Canvases and papers - 25% off\n🎨 Drawing supplies - 35% off\n🎨 Craft materials - 40% off\n\nInspire your artistic side today!\n\nArtistic Supplies Co.",
			},
		},
		{
			{
				subject: "Lunch and Learn Session",
				content: "Join us for this month's Lunch and Learn:\n\nTopic: \"Effective Project Management\"\nPresenter: Sarah Johnson, PMP\nDate: March 26, 2024\nTime: 12:00 PM - 1:00 PM\nLocation: Main Conference Room\n\nLunch will be provided!\n\nProfessional Development",
			},
		},
		{
			{
				subject: "Network Maintenance Window",
				content: "Planned network maintenance this Saturday:\n\nTime: 6 AM - 8 AM EST\nImpact: Brief internet interruptions\nDuration: Up to 15 minutes at a time\n\nAll systems will be fully operational by 8 AM.\n\nNetwork Operations",
			},
		},
		{
			{
				subject: "📱 New iPhone 15 - Pre-order Now!",
				content: "The revolutionary iPhone 15 is here!\n\n📱 Advanced camera system\n📱 All-day battery life  \n📱 Lightning-fast A17 chip\n📱 Available in 5 colors\n\nPre-order today, ships September 22nd\nTrade-in your old phone for up to $800 credit!\n\nMobile Store Express",
			},
		},
		{
			{
				subject: "Contract Renewal Notice",
				content: "Your service contract with CloudTech Solutions expires in 30 days.\n\nContract #: CT-2024-7789\nExpiry date: April 15, 2024\nRenewal options attached\n\nPlease contact us to discuss renewal.\n\nCloudTech Account Manager",
			},
		},
		{
			{
				subject: "Employee Survey Results",
				content: "Thank you for participating in our employee satisfaction survey.\n\nResponse rate: 87%\nOverall satisfaction: 4.2/5\nTop improvement areas:\n- Work-life balance\n- Career development\n\nDetailed results will be shared next week.\n\nHR Analytics Team",
			},
		},
		{
			{
				subject: "☕ Coffee Shop Grand Opening - Free Coffee!",
				content: "New coffee shop opening next to our office!\n\n☕ Grand opening special: Free coffee all day Monday\n☕ 20% employee discount ongoing  \n☕ Fresh pastries and sandwiches\n☕ Loyalty program available\n\nJoin us for the ribbon cutting at 8 AM!\n\nBrewmaster Coffee House",
			},
		},
		{
			{
				subject: "Backup System Test",
				content: "Monthly backup system test completed successfully.\n\nResults:\n- All databases backed up: ✓\n- File systems backed up: ✓\n- Restore test performed: ✓\n- Backup integrity verified: ✓\n\nNext test: April 15th\n\nBackup Administrator",
			},
		},
		{
			{
				subject: "Client Feedback Survey",
				content: "We received excellent feedback from our latest client project!\n\nOverall rating: 5/5 stars\nClient comments: \"Exceptional service and quality\"\nProject delivered on time and under budget\n\nGreat job team!\n\n- Client Relations",
			},
			{
				subject: "Re: Client Feedback Survey",
				content: "Fantastic news! This will help us with the upcoming proposal for their next project.\n\n- Sales Director",
			},
		},
		{
			{
				subject: "🏠 Home Insurance - Protect What Matters!",
				content: "Comprehensive home insurance at competitive rates!\n\n🏠 Property damage coverage\n🏠 Personal belongings protection\n🏠 Liability coverage included\n🏠 24/7 claim support\n\nGet a free quote in 5 minutes!\n\nSecure Home Insurance",
			},
		},
		{
			{
				subject: "Server Disk Space Warning",
				content: "Disk space warning on production server:\n\nServer: prod-db-01\nDisk usage: 85%\nThreshold: 80%\nRecommended action: Archive old logs\n\nPlease address before reaching 90%.\n\nSystem Monitoring",
			},
		},
		{
			{
				subject: "Training Certificate Received",
				content: "Congratulations! Your training certificate has been processed.\n\nCourse: Advanced Excel Techniques\nCompletion date: March 15, 2024\nCertificate ID: AET-2024-5678\n\nCertificate available in employee portal.\n\nTraining Department",
			},
		},
		{
			{
				subject: "📚 Online Learning Platform - Unlimited Courses!",
				content: "Expand your skills with unlimited access to online courses!\n\n📚 10,000+ courses available\n📚 Expert instructors\n📚 Certificates of completion\n📚 Mobile app included\n\nFirst month free - start learning today!\n\nLearnHub Platform",
			},
		},
		{
			{
				subject: "Office Renovation Update",
				content: "Office renovation project update:\n\nPhase 1 (Reception area): Complete\nPhase 2 (Break rooms): 60% complete\nPhase 3 (Meeting rooms): Starting next week\n\nExpected completion: April 30th\n\nFacilities Management",
			},
		},
		{
			{
				subject: "Email Server Migration",
				content: "Email server migration scheduled for this weekend:\n\nDate: March 23-24, 2024\nDowntime: Saturday 11 PM - Sunday 6 AM\nImpact: Email services unavailable\n\nNo action required from users.\n\nIT Infrastructure Team",
			},
			{
				subject: "Re: Email Server Migration",
				content: "Will we lose any emails during the migration?\n\n- Concerned Employee",
			},
			{
				subject: "Re: Email Server Migration",
				content: "No emails will be lost. All data will be migrated completely. Any emails received during the downtime will be queued and delivered once services resume.\n\n- IT Team",
			},
		},
		{
			{
				subject: "🎁 Holiday Gift Guide - Perfect Presents Await!",
				content: "Find the perfect gift for everyone on your list!\n\n🎁 Electronics and gadgets\n🎁 Fashion and accessories\n🎁 Home and kitchen items\n🎁 Books and games\n\nFree gift wrapping with purchase!\n\nHoliday Gift Central",
			},
		},
		{
			{
				subject: "Quarterly All-Hands Meeting",
				content: "Join us for our Q1 All-Hands meeting:\n\nDate: March 29, 2024\nTime: 3:00 PM - 4:30 PM\nLocation: Main auditorium\nAgenda: Q1 results, Q2 goals, team updates\n\nAttendance is mandatory.\n\n- Executive Team",
			},
		},
		{
			{
				subject: "Password Policy Update",
				content: "Important security update: New password policy effective April 1st.\n\nNew requirements:\n- Minimum 12 characters\n- Must include symbols\n- Cannot reuse last 5 passwords\n- Expires every 90 days\n\nUpdate your password before April 1st.\n\nCybersecurity Team",
			},
		},
		{
			{
				subject: "🌟 Premium Car Wash - Make Your Car Shine!",
				content: "Professional car detailing services at your workplace!\n\n🚗 Exterior wash and wax\n🚗 Interior cleaning and vacuum\n🚗 Tire shine and wheel cleaning\n🚗 Rain protection coating\n\nBooking available Tuesdays and Thursdays\nEmployee discount: 25% off\n\nMobile Car Wash Pro",
			},
		},
		{
			{
				subject: "Customer Service Award",
				content: "Congratulations to our customer service team for winning the \"Excellence in Customer Support\" award!\n\nThis recognition is well-deserved after achieving:\n- 98% customer satisfaction rating\n- Average response time under 2 hours\n- Zero escalated complaints last quarter\n\nCelebration lunch tomorrow at noon!\n\n- CEO",
			},
		},
		{
			{
				subject: "Software License Audit",
				content: "Annual software license audit begins next week.\n\nRequired actions:\n- Inventory all installed software\n- Verify license compliance\n- Remove unauthorized software\n- Report to compliance team by April 5th\n\nCompliance Officer",
			},
		},
		{
			{
				subject: "🍕 Pizza Making Class - Learn from the Pros!",
				content: "Master the art of authentic Italian pizza making!\n\n🍕 Hands-on cooking experience\n🍕 Professional chef instructor\n🍕 All ingredients provided\n🍕 Take home your creations\n\nClasses every Saturday at 2 PM\nBook now: CulinaryArts.com\n\nItalian Cooking Academy",
			},
		},
		{
			{
				subject: "Vendor Performance Review",
				content: "Q1 vendor performance review results:\n\nTop performers:\n- TechSupplies Inc. (A+ rating)\n- CleanCorp Services (A rating)\n- Office Solutions Ltd. (A- rating)\n\nImprovements needed:\n- FastDelivery Co. (C+ rating)\n\nProcurement Team",
			},
			{
				subject: "Re: Vendor Performance Review",
				content: "Should we consider alternative suppliers for FastDelivery Co.?\n\n- Operations Manager",
			},
			{
				subject: "Re: Vendor Performance Review",
				content: "Yes, let's get quotes from 2-3 alternative delivery companies and compare their service levels.\n\n- Procurement Manager",
			},
		},
		{
			{
				subject: "WiFi Network Upgrade",
				content: "WiFi network upgrade completed successfully!\n\nImprovements:\n- 3x faster speeds\n- Better coverage in all areas\n- New guest network available\n- Enhanced security protocols\n\nNetwork name remains the same, no password change needed.\n\nIT Networking Team",
			},
		},
		{
			{
				subject: "📱 Smart Watch Fitness Challenge - Join Now!",
				content: "Get fit with our latest smartwatch!\n\n⌚ 30-day fitness tracking\n⌚ Heart rate monitoring\n⌚ Sleep analysis\n⌚ Waterproof design\n\nSpecial launch price: $199 (reg. $299)\nFree fitness app subscription included!\n\nTech Fitness Store",
			},
		},
		{
			{
				subject: "Holiday Schedule Announcement",
				content: "Upcoming holiday schedule:\n\nGood Friday: April 7th (Office closed)\nEaster Monday: April 10th (Office closed)\nMemorial Day: May 29th (Office closed)\n\nPlease plan your projects accordingly.\n\nHuman Resources",
			},
		},
		{
			{
				subject: "Data Center Migration",
				content: "Data center migration planning meeting:\n\nDate: March 27, 2024\nTime: 10:00 AM\nAttendees: IT leadership, department heads\nLocation: Executive conference room\n\nAgenda and prep materials attached.\n\nCTO Office",
			},
		},
		{
			{
				subject: "🏖️ Summer Vacation Deals - Book Early & Save!",
				content: "Early bird summer vacation specials!\n\n🏖️ Caribbean cruises from $599\n🏖️ European tours from $1,299  \n🏖️ All-inclusive resorts from $899\n🏖️ Family packages available\n\nBook by March 31st for best prices!\n\nSummer Travel Agency",
			},
		},
		{
			{
				subject: "Quality Assurance Report",
				content: "Monthly QA report summary:\n\nBug detection rate: 95%\nTest coverage: 87%\nCritical bugs found: 3 (all fixed)\nRegression tests: All passed\n\nOverall quality rating: Excellent\n\nQA Team Lead",
			},
		},
		{
			{
				subject: "Employee Wellness Program",
				content: "New wellness program launching April 1st!\n\nProgram includes:\n- On-site yoga classes\n- Stress management workshops\n- Healthy cooking seminars\n- Mental health resources\n\nSign up at wellness.company.com\n\nWellness Committee",
			},
			{
				subject: "Re: Employee Wellness Program",
				content: "This sounds great! Are the yoga classes suitable for beginners?\n\n- Emily",
			},
		},
		{
			{
				subject: "🎮 Gaming Console Bundle - Ultimate Entertainment!",
				content: "Complete gaming experience in one package!\n\n🎮 Latest gaming console\n🎮 2 wireless controllers\n🎮 5 popular game titles\n🎮 Premium headset included\n\nLimited time bundle price: $499\nFree setup and installation!\n\nGameZone Electronics",
			},
		},
	}

	fakeSupportTicketThreads = [][]fakeEmail{
		{
			{
				subject: "Login Issues - Account Locked",
				content: "Hi Support,\n\nI'm unable to log into my account. It says my account is locked. Can you help me unlock it?\n\nUser ID: john.doe@company.com\n\nThanks,\nJohn",
			},
			{
				subject: "Re: Login Issues - Account Locked",
				content: "Hi John,\n\nI've unlocked your account. Please try logging in again and let me know if you have any issues.\n\nBest regards,\nSupport Team",
			},
		},
		{
			{
				subject: "Password Reset Request",
				content: "Hello,\n\nI need to reset my password for my account. The reset email isn't coming through.\n\nEmail: sarah.smith@example.com\n\nPlease help.",
			},
		},
		{
			{
				subject: "Billing Question - Duplicate Charge",
				content: "Hi,\n\nI see two charges on my credit card for the same amount. One should be removed.\n\nCharge amounts: $29.99 each\nDate: March 15, 2024\n\nPlease investigate.",
			},
			{
				subject: "Re: Billing Question - Duplicate Charge",
				content: "Hello,\n\nI've reviewed your account and found the duplicate charge. I've initiated a refund for $29.99. It should appear on your statement within 3-5 business days.\n\nSupport Team",
			},
		},
		{
			{
				subject: "Feature Request - Dark Mode",
				content: "Hi Support,\n\nWould it be possible to add a dark mode to the application? It would really help with eye strain during late night work sessions.\n\nThanks for considering!",
			},
			{
				subject: "Re: Feature Request - Dark Mode",
				content: "Thank you for the suggestion! I've forwarded this to our development team for consideration in upcoming releases.\n\nSupport Team",
			},
		},
		{
			{
				subject: "App Crashing on iPhone",
				content: "The app keeps crashing on my iPhone 14. It happens when I try to upload photos.\n\niOS version: 17.3.1\nApp version: 2.4.1\n\nPlease help!",
			},
			{
				subject: "Re: App Crashing on iPhone",
				content: "Thank you for reporting this. Can you try force-closing the app and restarting it? Also, please ensure you have the latest version from the App Store.\n\nSupport Team",
			},
			{
				subject: "Re: App Crashing on iPhone",
				content: "I tried that but it's still crashing. The app is up to date.",
			},
			{
				subject: "Re: App Crashing on iPhone",
				content: "I've escalated this to our technical team. They'll investigate the iOS compatibility issue. We'll update you within 24 hours.\n\nSupport Team",
			},
		},
		{
			{
				subject: "Cannot Download Invoice",
				content: "I'm trying to download my invoice from last month but the download button isn't working. Can you send it to me directly?\n\nAccount: premium_user_2024",
			},
		},
		{
			{
				subject: "Subscription Cancellation",
				content: "Hi,\n\nI need to cancel my subscription. I can't find the option in my account settings.\n\nPlease help me cancel it.",
			},
			{
				subject: "Re: Subscription Cancellation",
				content: "I can help you with that. I've cancelled your subscription. It will remain active until the end of your current billing period.\n\nSupport Team",
			},
		},
		{
			{
				subject: "Data Export Request",
				content: "Hello,\n\nI need to export all my data from your platform. How can I do this?\n\nThanks",
			},
			{
				subject: "Re: Data Export Request",
				content: "You can request a data export from your account settings under 'Privacy & Data'. The export will be ready within 48 hours.\n\nSupport Team",
			},
		},
		{
			{
				subject: "Account Upgrade Issue",
				content: "I'm trying to upgrade to the Pro plan but the payment keeps failing. My card is valid and has funds.\n\nError: Payment processing failed",
			},
			{
				subject: "Re: Account Upgrade Issue",
				content: "This might be due to international payment restrictions. Can you try a different payment method or contact your bank?\n\nSupport Team",
			},
			{
				subject: "Re: Account Upgrade Issue",
				content: "I tried PayPal and it worked! Thanks for the suggestion.",
			},
		},
		{
			{
				subject: "Missing Email Notifications",
				content: "I'm not receiving email notifications anymore. I checked my spam folder too.\n\nEmail: notifications@myemail.com",
			},
		},
		{
			{
				subject: "Website Loading Slowly",
				content: "Your website is loading very slowly for me. Is there a server issue?\n\nLocation: New York\nInternet: Fiber 100Mbps",
			},
			{
				subject: "Re: Website Loading Slowly",
				content: "We're experiencing some performance issues in the US East region. Our team is working on it. Expected resolution within 2 hours.\n\nSupport Team",
			},
		},
		{
			{
				subject: "API Rate Limit Exceeded",
				content: "I'm getting rate limit errors on the API even though I'm under my quota.\n\nAPI Key: dev_12345...\nEndpoint: /api/v1/users",
			},
			{
				subject: "Re: API Rate Limit Exceeded",
				content: "I see the issue. There was a bug in our rate limiting system. I've reset your limits and applied a fix. Please try again.\n\nAPI Support Team",
			},
		},
		{
			{
				subject: "Integration Not Working",
				content: "The Slack integration stopped working yesterday. No messages are coming through.\n\nWorkspace: mycompany.slack.com",
			},
			{
				subject: "Re: Integration Not Working",
				content: "Slack updated their API requirements. You'll need to reconnect the integration in your settings to continue receiving messages.\n\nSupport Team",
			},
		},
		{
			{
				subject: "Refund Request",
				content: "I was charged for a service I didn't use. Can I get a refund?\n\nCharge: $49.99 on March 10th\nReason: Accidental purchase",
			},
			{
				subject: "Re: Refund Request",
				content: "I've processed a full refund for $49.99. It should appear on your statement within 5-7 business days.\n\nBilling Support",
			},
		},
		{
			{
				subject: "Account Security Concern",
				content: "I received an email about a login from China, but I'm in the US. My account might be compromised.",
			},
			{
				subject: "Re: Account Security Concern",
				content: "I've immediately secured your account and forced a logout on all devices. Please change your password and enable 2FA.\n\nSecurity Team",
			},
			{
				subject: "Re: Account Security Concern",
				content: "Done! I've changed my password and enabled 2FA. Is my account safe now?",
			},
			{
				subject: "Re: Account Security Concern",
				content: "Yes, your account is now secure. We'll continue monitoring for any suspicious activity.\n\nSecurity Team",
			},
		},
		{
			{
				subject: "File Upload Error",
				content: "I'm getting an error when trying to upload files larger than 5MB.\n\nError: File size exceeds limit\nFile type: PDF",
			},
		},
		{
			{
				subject: "Mobile App Update Issues",
				content: "After the latest app update, I can't access my saved documents.\n\nDevice: Samsung Galaxy S23\nApp version: 3.1.0",
			},
			{
				subject: "Re: Mobile App Update Issues",
				content: "This is a known issue with version 3.1.0. We're releasing a hotfix tomorrow. Your documents are safe and will reappear after the update.\n\nMobile Support",
			},
		},
		{
			{
				subject: "Print Function Not Working",
				content: "The print button in the web interface doesn't do anything. No print dialog opens.\n\nBrowser: Chrome 122\nOS: Windows 11",
			},
			{
				subject: "Re: Print Function Not Working",
				content: "Please try disabling your ad blocker for our site, as it might be blocking the print dialog.\n\nTech Support",
			},
		},
		{
			{
				subject: "Collaboration Feature Bug",
				content: "When I share a document with colleagues, they can't see the latest changes.\n\nDocument: Project_Plan_2024.docx",
			},
			{
				subject: "Re: Collaboration Feature Bug",
				content: "There was a sync issue. I've manually refreshed the document. Your colleagues should now see all updates.\n\nSupport Team",
			},
		},
		{
			{
				subject: "Database Connection Error",
				content: "Getting 'Database connection failed' error when trying to generate reports.\n\nTime: Around 2 PM EST\nReport type: Monthly sales",
			},
		},
		{
			{
				subject: "License Key Invalid",
				content: "My license key is showing as invalid even though it's within the valid period.\n\nKey: ABCD-1234-EFGH-5678\nExpiry: December 2024",
			},
			{
				subject: "Re: License Key Invalid",
				content: "I've refreshed your license status in our system. Please restart the application and try again.\n\nLicense Support",
			},
		},
		{
			{
				subject: "Export Feature Missing Data",
				content: "When I export my data to CSV, some fields are missing. Specifically the 'Category' column.\n\nDate range: January - March 2024",
			},
			{
				subject: "Re: Export Feature Missing Data",
				content: "I found the issue. The Category field was added recently and wasn't included in the export function. This will be fixed in next week's update.\n\nDevelopment Team",
			},
		},
		{
			{
				subject: "Search Function Not Working",
				content: "The search bar returns no results even for items I know exist.\n\nSearch term: 'project alpha'\nExpected results: 15+ items",
			},
		},
		{
			{
				subject: "Email Template Error",
				content: "Custom email templates aren't saving properly. Changes get reverted after page refresh.\n\nTemplate: Welcome Email\nBrowser: Firefox",
			},
			{
				subject: "Re: Email Template Error",
				content: "This is a browser compatibility issue. Can you try using Chrome or Safari? We're working on a Firefox fix.\n\nSupport Team",
			},
		},
		{
			{
				subject: "Two-Factor Authentication Issue",
				content: "My 2FA codes aren't working. I've tried multiple codes from my authenticator app.\n\nApp: Google Authenticator",
			},
			{
				subject: "Re: Two-Factor Authentication Issue",
				content: "The time on your device might be out of sync. Please ensure your device time is accurate and try again.\n\nSecurity Support",
			},
			{
				subject: "Re: Two-Factor Authentication Issue",
				content: "That fixed it! Thank you so much.",
			},
		},
		{
			{
				subject: "Dashboard Charts Not Loading",
				content: "The charts on my dashboard show as blank. All other elements load fine.\n\nDashboard: Sales Overview\nBrowser: Edge",
			},
		},
		{
			{
				subject: "Notification Preferences Reset",
				content: "My notification preferences keep resetting to default every few days.\n\nPreferred setting: Email only, no SMS",
			},
			{
				subject: "Re: Notification Preferences Reset",
				content: "I've found and fixed the bug causing preference resets. Your settings should now persist properly.\n\nSupport Team",
			},
		},
		{
			{
				subject: "Calendar Sync Issues",
				content: "Events aren't syncing between the app and my Google Calendar.\n\nCalendar: work@company.com\nLast sync: 3 days ago",
			},
			{
				subject: "Re: Calendar Sync Issues",
				content: "Google updated their calendar API. You'll need to disconnect and reconnect your calendar in the integrations section.\n\nSupport Team",
			},
		},
		{
			{
				subject: "Bulk Import Failed",
				content: "Trying to import 500 contacts but the process fails at around 200.\n\nFile format: CSV\nFile size: 2MB",
			},
			{
				subject: "Re: Bulk Import Failed",
				content: "Large imports can timeout. Try splitting your file into smaller batches of 100 contacts each.\n\nData Team",
			},
		},
		{
			{
				subject: "Video Call Quality Poor",
				content: "Video calls through the platform have poor quality and frequent disconnections.\n\nConnection: 50Mbps fiber\nParticipants: 4 people",
			},
		},
		{
			{
				subject: "Custom Domain Setup",
				content: "Need help setting up my custom domain for the white-label solution.\n\nDomain: portal.mycompany.com\nPlan: Enterprise",
			},
			{
				subject: "Re: Custom Domain Setup",
				content: "I'll need you to add a CNAME record pointing to our servers. I'll send detailed instructions shortly.\n\nEnterprise Support",
			},
		},
		{
			{
				subject: "Report Generation Timeout",
				content: "Large reports (>10,000 rows) are timing out and not generating.\n\nReport: Annual customer data\nTimeframe: Full year 2023",
			},
			{
				subject: "Re: Report Generation Timeout",
				content: "For large reports, please use the scheduled report feature. It will email you when complete.\n\nReporting Team",
			},
		},
		{
			{
				subject: "SSO Integration Issue",
				content: "Single Sign-On isn't working with our Azure AD setup.\n\nError: Invalid SAML response\nProvider: Microsoft Azure",
			},
			{
				subject: "Re: SSO Integration Issue",
				content: "The SAML configuration needs updating. I'll schedule a call with your IT team to resolve this.\n\nEnterprise Support",
			},
		},
		{
			{
				subject: "Data Migration Request",
				content: "Moving from competitor platform. Need help migrating 50,000 records.\n\nCurrent platform: OldCRM Pro\nData types: Contacts, deals, tasks",
			},
		},
		{
			{
				subject: "Performance Issues",
				content: "The application is very slow when loading large datasets (>1000 items).\n\nDataset: Customer list\nLoad time: 30+ seconds",
			},
			{
				subject: "Re: Performance Issues",
				content: "We're implementing pagination for large datasets. This will be available in next month's release.\n\nPerformance Team",
			},
		},
		{
			{
				subject: "Webhook Not Triggering",
				content: "Webhooks stopped firing yesterday. No events are being sent to our endpoint.\n\nEndpoint: https://api.oursite.com/webhook\nEvents: user.created, user.updated",
			},
			{
				subject: "Re: Webhook Not Triggering",
				content: "I see your endpoint is returning 500 errors. Once you fix the endpoint, webhooks will resume automatically.\n\nAPI Team",
			},
		},
		{
			{
				subject: "Theme Customization Help",
				content: "How can I change the primary color in my custom theme?\n\nCurrent: Blue (#007bff)\nDesired: Green (#28a745)",
			},
			{
				subject: "Re: Theme Customization Help",
				content: "Go to Settings > Appearance > Custom CSS and add: :root { --primary-color: #28a745; }\n\nDesign Support",
			},
		},
		{
			{
				subject: "Automated Backup Failed",
				content: "Daily backup job failed for the third day in a row.\n\nBackup time: 2 AM UTC\nError: Insufficient storage space",
			},
		},
		{
			{
				subject: "User Permission Error",
				content: "I can't access the admin panel even though I have admin rights.\n\nRole: Super Admin\nError: Access denied",
			},
			{
				subject: "Re: User Permission Error",
				content: "Your admin session expired. Please log out completely and log back in to refresh your permissions.\n\nSupport Team",
			},
		},
		{
			{
				subject: "Form Submission Error",
				content: "Contact forms on our website aren't submitting. Users get a generic error.\n\nForm: Contact Us\nError: Submission failed",
			},
			{
				subject: "Re: Form Submission Error",
				content: "The email service was temporarily down. All pending form submissions have been processed and the issue is resolved.\n\nTech Support",
			},
		},
		{
			{
				subject: "Analytics Data Discrepancy",
				content: "Analytics dashboard shows different numbers than my Google Analytics.\n\nOur dashboard: 5,234 visitors\nGoogle Analytics: 6,891 visitors",
			},
		},
		{
			{
				subject: "Plugin Compatibility Issue",
				content: "Third-party plugin causing conflicts with your software.\n\nPlugin: Advanced SEO Tools\nIssue: Page loading errors",
			},
			{
				subject: "Re: Plugin Compatibility Issue",
				content: "This plugin version is incompatible. Please update to version 2.3.1 or disable it temporarily.\n\nTech Support",
			},
		},
		{
			{
				subject: "Database Query Slow",
				content: "Custom reports are taking 5+ minutes to load.\n\nQuery type: JOIN across 4 tables\nRecord count: ~100,000",
			},
			{
				subject: "Re: Database Query Slow",
				content: "We've optimized the database indices for your query type. Reports should now load in under 30 seconds.\n\nDatabase Team",
			},
		},
		{
			{
				subject: "Email Deliverability Issue",
				content: "Emails sent through the platform are going to spam folders.\n\nEmail type: Marketing newsletters\nProvider: Gmail, Outlook",
			},
		},
		{
			{
				subject: "Session Timeout Too Short",
				content: "I keep getting logged out every 15 minutes. Can this be extended?\n\nCurrent timeout: 15 minutes\nPreferred: 2 hours",
			},
			{
				subject: "Re: Session Timeout Too Short",
				content: "I've updated your account settings to extend the session timeout to 2 hours.\n\nSupport Team",
			},
		},
		{
			{
				subject: "Multi-language Support",
				content: "When will Spanish language support be available?\n\nCurrent: English only\nNeeded for: Customer portal",
			},
			{
				subject: "Re: Multi-language Support",
				content: "Spanish support is planned for Q3 2024. French and German will follow in Q4.\n\nProduct Team",
			},
		},
		{
			{
				subject: "Image Upload Compression",
				content: "Uploaded images are being over-compressed and look blurry.\n\nOriginal: 2MB JPEG\nCompressed: 200KB with visible artifacts",
			},
		},
		{
			{
				subject: "Keyboard Shortcuts Not Working",
				content: "None of the keyboard shortcuts work in the web interface.\n\nBrowser: Safari 17\nOS: macOS Sonoma",
			},
			{
				subject: "Re: Keyboard Shortcuts Not Working",
				content: "Safari has some restrictions on keyboard events. Try enabling 'Developer' menu and check 'Disable Local File Restrictions'.\n\nSupport Team",
			},
		},
		{
			{
				subject: "Recurring Payment Failed",
				content: "Monthly subscription payment failed but my card is valid.\n\nCard: Visa ending 1234\nAmount: $29.99",
			},
			{
				subject: "Re: Recurring Payment Failed",
				content: "Your card issuer declined the transaction. Please contact them or try a different payment method.\n\nBilling Support",
			},
		},
		{
			{
				subject: "PDF Export Formatting Issue",
				content: "Exported PDFs have incorrect formatting and cut-off text.\n\nContent: Financial reports\nPage size: A4",
			},
		},
		{
			{
				subject: "Time Zone Display Wrong",
				content: "All timestamps show in UTC instead of my local timezone.\n\nLocation: Pacific Time (PST)\nSetting: Should auto-detect",
			},
			{
				subject: "Re: Time Zone Display Wrong",
				content: "Please check your browser's location permissions for our site. The timezone detection needs location access.\n\nSupport Team",
			},
		},
		{
			{
				subject: "Custom Field Not Saving",
				content: "Added a custom field 'Project Status' but values don't save.\n\nField type: Dropdown\nOptions: Active, Pending, Complete",
			},
			{
				subject: "Re: Custom Field Not Saving",
				content: "There was a validation rule blocking certain field names. I've fixed this and your field should work now.\n\nSupport Team",
			},
		},
		{
			{
				subject: "Duplicate Record Detection",
				content: "System isn't detecting obvious duplicate records.\n\nExample: Same email, same name, different IDs\nFeature: Merge duplicates",
			},
		},
		{
			{
				subject: "GDPR Data Request",
				content: "Customer requesting all personal data we have stored.\n\nCustomer email: gdpr.request@example.com\nRequest type: Data export",
			},
			{
				subject: "Re: GDPR Data Request",
				content: "I've generated the data export. Please verify the customer's identity before sending. Export expires in 7 days.\n\nCompliance Team",
			},
		},
		{
			{
				subject: "Load Balancer Issues",
				content: "Getting intermittent 502 errors during peak hours.\n\nTime: 9 AM - 11 AM EST\nFrequency: ~10% of requests",
			},
			{
				subject: "Re: Load Balancer Issues",
				content: "We're scaling up server capacity to handle peak loads. This should resolve the 502 errors.\n\nInfrastructure Team",
			},
		},
		{
			{
				subject: "Audit Trail Missing",
				content: "Some user actions aren't appearing in the audit log.\n\nMissing: File deletions from yesterday\nPresent: File uploads, edits",
			},
		},
		{
			{
				subject: "Cross-browser Compatibility",
				content: "Interface looks broken in Internet Explorer 11.\n\nIssues: Misaligned buttons, missing styles\nWorkaround needed: Corporate policy requires IE11",
			},
			{
				subject: "Re: Cross-browser Compatibility",
				content: "IE11 support was deprecated in our last update. We can provide a legacy compatibility mode for enterprise customers.\n\nSupport Team",
			},
		},
		{
			{
				subject: "File Permissions Error",
				content: "Can't modify files uploaded by other team members.\n\nFile: shared_document.pdf\nError: Permission denied",
			},
			{
				subject: "Re: File Permissions Error",
				content: "The file owner needs to explicitly share edit permissions with you. I've sent them a notification.\n\nSupport Team",
			},
		},
		{
			{
				subject: "Cache Issues After Update",
				content: "After yesterday's update, seeing old interface elements.\n\nIssue: Old buttons, outdated menu\nTried: Hard refresh, clearing browser cache",
			},
		},
		{
			{
				subject: "Memory Leak in Browser",
				content: "Browser tab uses increasing amounts of RAM over time.\n\nBrowser: Chrome\nRAM usage: Starts 200MB, grows to 2GB+",
			},
			{
				subject: "Re: Memory Leak in Browser",
				content: "This is a known issue with certain browser extensions. Try disabling ad blockers and extensions one by one.\n\nTech Support",
			},
		},
		{
			{
				subject: "Backup Restoration Request",
				content: "Accidentally deleted important data. Need restoration from yesterday's backup.\n\nData: Customer database entries\nTime deleted: This morning 9 AM",
			},
			{
				subject: "Re: Backup Restoration Request",
				content: "I've restored the deleted entries from yesterday's 11 PM backup. Please verify all data is present.\n\nData Recovery Team",
			},
		},
		{
			{
				subject: "SSL Certificate Expiring",
				content: "Getting SSL certificate warnings on our custom domain.\n\nDomain: app.ourcompany.com\nExpiry: Next week",
			},
		},
		{
			{
				subject: "Rate Limiting Too Strict",
				content: "API rate limits are too restrictive for our use case.\n\nCurrent limit: 100 requests/hour\nNeed: 500 requests/hour",
			},
			{
				subject: "Re: Rate Limiting Too Strict",
				content: "I've upgraded your API plan to allow 1000 requests/hour. This should meet your needs.\n\nAPI Support",
			},
		},
		{
			{
				subject: "Regional Server Access",
				content: "Slow performance from our European office.\n\nLocation: London, UK\nResponse time: 3-5 seconds",
			},
			{
				subject: "Re: Regional Server Access",
				content: "We're launching European servers next month. I'll add you to the beta program for early access.\n\nInfrastructure Team",
			},
		},
		{
			{
				subject: "Data Import Validation Error",
				content: "CSV import failing with validation errors for valid data.\n\nError: Invalid date format\nDate format used: DD/MM/YYYY",
			},
		},
		{
			{
				subject: "White Label Customization",
				content: "Need to remove all references to your company branding for our white label deployment.\n\nRequired: Complete rebranding\nPlan: Enterprise Plus",
			},
			{
				subject: "Re: White Label Customization",
				content: "I'll set up a customization session with our design team. They'll handle complete rebranding within 1 week.\n\nEnterprise Support",
			},
		},
		{
			{
				subject: "Scheduled Maintenance Impact",
				content: "Will tonight's maintenance affect our production environment?\n\nMaintenance time: 2 AM - 4 AM EST\nCritical operations: Customer onboarding",
			},
			{
				subject: "Re: Scheduled Maintenance Impact",
				content: "The maintenance only affects our reporting servers. All customer-facing features will remain operational.\n\nOperations Team",
			},
		},
		{
			{
				subject: "Feature Flag Not Working",
				content: "Enabled beta feature flag but new functionality isn't visible.\n\nFlag: advanced_analytics\nAccount: premium_enterprise",
			},
		},
		{
			{
				subject: "Training Session Request",
				content: "New team members need training on advanced features.\n\nTeam size: 8 people\nPreferred time: Next week",
			},
			{
				subject: "Re: Training Session Request",
				content: "I'll schedule a group training session for next Tuesday at 2 PM. Meeting invite will follow.\n\nCustomer Success",
			},
		},
		{
			{
				subject: "Compliance Report Generation",
				content: "Need automated compliance reports for SOC 2 audit.\n\nFrequency: Monthly\nFormat: PDF with digital signature",
			},
			{
				subject: "Re: Compliance Report Generation",
				content: "I've set up automated monthly compliance reports. The first one will be generated at month-end.\n\nCompliance Team",
			},
		},
		{
			{
				subject: "Third-party Integration Broken",
				content: "Zapier integration stopped working after your platform update.\n\nIntegration: Lead capture from forms\nError: Authentication failed",
			},
		},
		{
			{
				subject: "Usage Analytics Request",
				content: "Need detailed usage analytics for cost optimization.\n\nMetrics needed: API calls, storage, bandwidth\nPeriod: Last 6 months",
			},
			{
				subject: "Re: Usage Analytics Request",
				content: "I've generated a comprehensive usage report and sent it to your email. It includes recommendations for optimization.\n\nAccount Management",
			},
		},
		{
			{
				subject: "Emergency Access Required",
				content: "Locked out during critical deployment. Need immediate access restoration.\n\nUrgency: Critical\nImpact: Production deployment blocked",
			},
			{
				subject: "Re: Emergency Access Required",
				content: "Access restored immediately. I've also set up an emergency access protocol for future incidents.\n\nEmergency Support",
			},
		},
	}

	fakeSalesExecutiveThreads = [][]fakeEmail{
		{
			{
				subject: "Introduction from LinkedIn - Interested in Your Solution",
				content: "Hi Sarah,\n\nI found your profile on LinkedIn and I'm impressed by your company's growth trajectory. We're looking for a solution to streamline our workflow processes.\n\nWould you be available for a brief 15-minute call next week?\n\nBest regards,\nMichael Chen\nOperations Director, TechStart Inc.",
			},
			{
				subject: "Re: Introduction from LinkedIn - Interested in Your Solution",
				content: "Hi Michael,\n\nThank you for reaching out! I'd love to learn more about TechStart's workflow challenges and see how we can help.\n\nI have availability Tuesday at 2 PM or Wednesday at 10 AM. Which works better for you?\n\nBest,\nSarah",
			},
			{
				subject: "Re: Introduction from LinkedIn - Interested in Your Solution",
				content: "Tuesday at 2 PM works perfectly. I'll send you a calendar invite.\n\nLooking forward to our conversation!\n\nMichael",
			},
		},
		{
			{
				subject: "Follow-up on Demo Request",
				content: "Hi Sarah,\n\nHope you had a great weekend! Following up on our conversation last week about scheduling a product demo for our team.\n\nWe're particularly interested in the automation features and integration capabilities.\n\nWhen would be a good time for a 45-minute demo?\n\nThanks,\nJennifer Rodriguez\nCTO, DataFlow Solutions",
			},
		},
		{
			{
				subject: "Proposal Review - Ready to Move Forward",
				content: "Sarah,\n\nI've reviewed your proposal with my team. The pricing looks good and the solution fits our needs well.\n\nWe have a few questions about implementation timeline and training. Can we schedule a call this week?\n\nAlso, do you have any case studies from companies similar to ours?\n\nBest,\nDavid Kim\nVP of Technology",
			},
			{
				subject: "Re: Proposal Review - Ready to Move Forward",
				content: "Hi David,\n\nGreat news! I'm excited to move forward with you.\n\nI have several case studies I can share, including one from a company very similar to yours that saw 40% efficiency gains.\n\nHow about Thursday at 3 PM for our call? I'll also prepare answers to your implementation questions.\n\nBest,\nSarah",
			},
		},
		{
			{
				subject: "Contract Questions - Legal Review",
				content: "Hi Sarah,\n\nOur legal team has reviewed the contract and they have a few questions about data security clauses and liability terms.\n\nCan you connect me with someone from your legal team?\n\nWe're still on track for our planned start date if we can resolve these quickly.\n\nRegards,\nLisa Thompson\nProcurement Manager",
			},
			{
				subject: "Re: Contract Questions - Legal Review",
				content: "Hi Lisa,\n\nAbsolutely! I'll connect you with our General Counsel, Mark Stevens. He'll be able to address all your legal team's concerns.\n\nI'm CC'ing him on this email and he'll reach out directly.\n\nThanks for keeping us on track!\n\nSarah",
			},
		},
		{
			{
				subject: "Urgent: Budget Approval Needed by Friday",
				content: "Sarah,\n\nWe need to get budget approval by Friday to proceed. The board meeting is Thursday and I need all final details.\n\nCan you confirm:\n1. Final pricing with discounts\n2. Payment terms\n3. Implementation timeline\n\nThis is time-sensitive. Please respond ASAP.\n\nThanks,\nRobert Martinez\nCFO, GrowthTech",
			},
		},
		{
			{
				subject: "Competitor Comparison Request",
				content: "Hi Sarah,\n\nWe're also evaluating [Competitor X] and [Competitor Y]. Can you provide a comparison showing your advantages?\n\nSpecifically interested in:\n- Feature differences\n- Pricing comparison\n- Integration capabilities\n- Support quality\n\nThanks,\nAmanda Foster\nIT Director",
			},
			{
				subject: "Re: Competitor Comparison Request",
				content: "Hi Amanda,\n\nI'd be happy to provide a detailed comparison. Rather than just sending you materials, would you prefer a brief call where I can walk through the differences and answer your specific questions?\n\nI think you'll find our integration capabilities and support model quite compelling compared to the competition.\n\nWhen would work for you?\n\nBest,\nSarah",
			},
		},
		{
			{
				subject: "Referral - My Colleague at StartupCorp",
				content: "Sarah,\n\nI mentioned your solution to my colleague Jane Wilson at StartupCorp. They're facing similar challenges to what we had.\n\nShe's interested in learning more. Her email is jane.wilson@startupcorp.com.\n\nThanks for the great work on our implementation!\n\nBest,\nTom Johnson",
			},
			{
				subject: "Re: Referral - My Colleague at StartupCorp",
				content: "Hi Tom,\n\nThank you so much for the referral! I really appreciate you thinking of us.\n\nI'll reach out to Jane this week. And I'm so glad to hear your implementation is going well!\n\nBest,\nSarah",
			},
		},
		{
			{
				subject: "Demo Feedback - Next Steps",
				content: "Hi Sarah,\n\nThanks for the excellent demo yesterday. My team was very impressed with the platform.\n\nWe'd like to move forward with a pilot program. What would that look like?\n\nAlso, can you send pricing for 50 users?\n\nBest regards,\nKevin Park\nHead of Operations",
			},
		},
		{
			{
				subject: "Contract Signed - Ready for Kickoff!",
				content: "Sarah,\n\nGreat news! The contract is fully executed and we're ready to begin implementation.\n\nWhat are the next steps? When can we schedule our kickoff meeting?\n\nExcited to get started!\n\nBest,\nMaria Gonzalez\nProject Manager",
			},
			{
				subject: "Re: Contract Signed - Ready for Kickoff!",
				content: "Hi Maria,\n\nFantastic! Welcome to the team!\n\nI'm connecting you with our Implementation Manager, Steve Wilson, who will be your main point of contact going forward.\n\nSteve will reach out today to schedule the kickoff for early next week.\n\nBest,\nSarah",
			},
		},
		{
			{
				subject: "Renewal Discussion - Contract Expires Next Month",
				content: "Hi Sarah,\n\nOur contract expires next month and we want to discuss renewal options.\n\nWe've been very happy with the service and are looking to expand to additional departments.\n\nCan we schedule a renewal discussion?\n\nThanks,\nJohn Miller\nVP of Operations",
			},
		},
		{
			{
				subject: "Pricing Question - Volume Discount",
				content: "Sarah,\n\nWe're considering expanding from 25 to 100 users. What kind of volume discounts do you offer?\n\nAlso, are there additional features available at higher tiers?\n\nLet me know when you have a chance.\n\nBest,\nRachel Davis\nIT Manager",
			},
			{
				subject: "Re: Pricing Question - Volume Discount",
				content: "Hi Rachel,\n\nGreat to hear you're looking to expand! At 100 users, you'd qualify for our Enterprise tier which includes:\n\n- 25% volume discount\n- Advanced analytics\n- Priority support\n- Additional integrations\n\nI'd love to walk you through the benefits. Are you free for a quick call this week?\n\nBest,\nSarah",
			},
		},
		{
			{
				subject: "Trade Show Follow-up - TechExpo 2024",
				content: "Hi Sarah,\n\nIt was great meeting you at TechExpo yesterday. I'm the CTO we discussed workflow automation with at your booth.\n\nI'd like to schedule a follow-up call to discuss how your solution could help with our manufacturing processes.\n\nBest regards,\nAndrew Chen\nCTO, ManufactureTech",
			},
		},
		{
			{
				subject: "Implementation Complete - Very Satisfied!",
				content: "Sarah,\n\nI wanted to personally thank you for the smooth implementation process. The team is already seeing productivity improvements.\n\nWe'd be happy to serve as a reference for future prospects.\n\nAlso, we're interested in exploring additional modules. Can we discuss expansion options?\n\nBest,\nSamantha Lee\nDirector of Operations",
			},
			{
				subject: "Re: Implementation Complete - Very Satisfied!",
				content: "Hi Samantha,\n\nThis is wonderful feedback! Thank you so much.\n\nI'd love to discuss expansion options. We have several modules that could complement your current setup.\n\nAlso, I'll definitely reach out when we have prospects who would benefit from speaking with you.\n\nCan we schedule a call next week to discuss expansion?\n\nBest,\nSarah",
			},
		},
		{
			{
				subject: "Budget Freeze - Need to Postpone Decision",
				content: "Sarah,\n\nUnfortunately, we have a budget freeze for Q1 and need to postpone our purchase decision until Q2.\n\nWill your current pricing still be available then?\n\nSorry for the delay. We're definitely still interested.\n\nBest,\nBrian Wilson\nFinance Director",
			},
		},
		{
			{
				subject: "ROI Case Study Request",
				content: "Hi Sarah,\n\nTo help with internal approval, could you provide a detailed ROI case study showing quantified benefits?\n\nMy CEO wants to see hard numbers on productivity gains and cost savings.\n\nThanks,\nDiana Martinez\nOperations Manager",
			},
			{
				subject: "Re: ROI Case Study Request",
				content: "Hi Diana,\n\nI have a perfect case study that shows a 35% productivity increase and $200K annual savings for a company your size.\n\nI can also create a customized ROI projection based on your specific requirements.\n\nWould you like to schedule a call to review both?\n\nBest,\nSarah",
			},
		},
		{
			{
				subject: "Security Audit Requirements",
				content: "Sarah,\n\nOur security team needs detailed documentation about your platform's security measures before we can proceed.\n\nSpecifically:\n- SOC 2 compliance\n- Data encryption methods\n- Access controls\n- Backup procedures\n\nCan you provide these documents?\n\nThanks,\nMike Johnson\nCISO",
			},
		},
		{
			{
				subject: "Integration Requirements Discussion",
				content: "Hi Sarah,\n\nWe need to integrate with Salesforce, HubSpot, and our custom ERP system. Can your platform handle these integrations?\n\nAlso, what's the typical timeline and cost for custom integrations?\n\nBest,\nCarol White\nIT Director",
			},
			{
				subject: "Re: Integration Requirements Discussion",
				content: "Hi Carol,\n\nYes, we have native integrations with both Salesforce and HubSpot. For your custom ERP, we'd need to scope that out.\n\nTypically, custom integrations take 2-4 weeks and cost $5-15K depending on complexity.\n\nCan we schedule a technical call with our integration team?\n\nBest,\nSarah",
			},
		},
		{
			{
				subject: "Pilot Program Results - Ready for Full Deployment",
				content: "Sarah,\n\nOur 30-day pilot with 10 users was a huge success! We're ready to deploy to our full team of 150 users.\n\nWhat's the process for scaling up? Any additional costs?\n\nExcited to move forward!\n\nBest,\nJessica Brown\nHead of Product",
			},
		},
		{
			{
				subject: "Competitive Situation - Need Better Terms",
				content: "Sarah,\n\nWe received a very competitive proposal from [Competitor]. Their pricing is 20% lower.\n\nWe prefer your solution, but need you to match their pricing to move forward.\n\nCan we discuss?\n\nThanks,\nSteve Davis\nCOO",
			},
			{
				subject: "Re: Competitive Situation - Need Better Terms",
				content: "Hi Steve,\n\nI understand the pricing pressure. Let me review what options I have available.\n\nCan we schedule a call tomorrow? I'd like to discuss the total value proposition and see if we can find a creative solution.\n\nI'm committed to making this work.\n\nBest,\nSarah",
			},
		},
		{
			{
				subject: "CEO Approval Required - Board Presentation",
				content: "Hi Sarah,\n\nI need to present this to our board next week for CEO approval. Can you provide:\n\n1. Executive summary\n2. Implementation plan\n3. Risk mitigation\n4. ROI projections\n\nThis is a $500K decision so they'll want details.\n\nThanks,\nRobert Kim\nCTO",
			},
		},
		{
			{
				subject: "Training Requirements for 200+ Users",
				content: "Sarah,\n\nWe'll need comprehensive training for 200+ users across 5 locations. What training options do you offer?\n\nPreferably a mix of online and in-person sessions.\n\nWhat are the costs and timelines?\n\nBest,\nLaura Johnson\nTraining Manager",
			},
			{
				subject: "Re: Training Requirements for 200+ Users",
				content: "Hi Laura,\n\nWe offer several training options:\n- Online certification program\n- Train-the-trainer sessions\n- On-site workshops\n\nFor 200 users across 5 locations, I'd recommend a blended approach. Let me prepare a detailed training plan and pricing.\n\nCan we discuss this week?\n\nBest,\nSarah",
			},
		},
		{
			{
				subject: "Quarterly Business Review - Expansion Opportunities",
				content: "Hi Sarah,\n\nIt's time for our quarterly business review. We've had great success with the initial deployment and want to explore expansion to our European division.\n\nCan we schedule our QBR for next week?\n\nBest,\nPeter Schmidt\nGlobal IT Director",
			},
		},
		{
			{
				subject: "Reference Customer Request",
				content: "Sarah,\n\nA prospect wants to speak with one of your current customers in the manufacturing industry. Do you have someone willing to serve as a reference?\n\nSimilar company size (500-1000 employees) would be ideal.\n\nThanks,\nNancy Taylor\nProcurement Specialist",
			},
			{
				subject: "Re: Reference Customer Request",
				content: "Hi Nancy,\n\nI have the perfect reference! ManufactureTech Corp (similar size, industry, use case) and they're happy to speak with prospects.\n\nI'll connect you with their Operations Director, Mark Stevens. He's very articulate about the benefits they've seen.\n\nI'll make the introduction today.\n\nBest,\nSarah",
			},
		},
		{
			{
				subject: "Contract Amendment - Adding 50 More Users",
				content: "Sarah,\n\nWe need to add 50 more users to our contract effective immediately. What's the process and pricing?\n\nOur current contract has provisions for expansion, right?\n\nThanks,\nTony Rodriguez\nHR Director",
			},
		},
		{
			{
				subject: "Acquisition Impact - Contract Continuity",
				content: "Hi Sarah,\n\nOur company is being acquired next month. How will this affect our contract and pricing?\n\nWe want to ensure continuity of service during the transition.\n\nBest regards,\nKimberly Lee\nM&A Lead",
			},
			{
				subject: "Re: Acquisition Impact - Contract Continuity",
				content: "Hi Kimberly,\n\nCongratulations on the acquisition! We've handled many M&A transitions smoothly.\n\nYour contract will remain in effect and we can work with the acquiring company to ensure seamless continuity.\n\nI'd like to connect with their IT team when appropriate.\n\nBest,\nSarah",
			},
		},
		{
			{
				subject: "End of Year Budget - Need to Close by December 31st",
				content: "Sarah,\n\nWe have budget that needs to be spent by December 31st or we lose it. Can we accelerate our timeline?\n\nWilling to sign this month if we can get implementation started by January.\n\nLet me know what's possible.\n\nThanks,\nFrank Miller\nIT Budget Manager",
			},
		},
		{
			{
				subject: "Feature Request - Custom Reporting Module",
				content: "Hi Sarah,\n\nWe love the platform but need more advanced reporting capabilities. Do you have a custom reporting module?\n\nIf not, what would it cost to develop one?\n\nThis could be a significant expansion for us.\n\nBest,\nGrace Wong\nBusiness Intelligence Manager",
			},
		},
		{
			{
				subject: "Partnership Opportunity - System Integration",
				content: "Sarah,\n\nWe're a systems integrator and see opportunities to resell your solution to our clients.\n\nAre you looking for partners? What does your partner program look like?\n\nWe have 200+ clients who could benefit.\n\nInterested in discussing?\n\nBest,\nChris Anderson\nBusiness Development",
			},
			{
				subject: "Re: Partnership Opportunity - System Integration",
				content: "Hi Chris,\n\nWe're definitely interested in strategic partnerships! We have a robust partner program with training, support, and attractive margins.\n\n200+ potential clients sounds very promising.\n\nCan we schedule a call to discuss the program details and qualification process?\n\nBest,\nSarah",
			},
		},
		{
			{
				subject: "Urgent: Decision Needed by Tomorrow",
				content: "Sarah,\n\nOur current vendor contract expires tomorrow and we need to make a decision immediately.\n\nCan you expedite the contract process? We're ready to sign today if possible.\n\nThis is genuinely urgent.\n\nThanks,\nDamon Smith\nOperations Director",
			},
		},
		{
			{
				subject: "Multi-Year Contract Discount Request",
				content: "Hi Sarah,\n\nInstead of annual renewal, we'd prefer a 3-year contract for budget predictability.\n\nWhat kind of discount would you offer for a multi-year commitment?\n\nBest,\nValerie Chen\nFinance Director",
			},
			{
				subject: "Re: Multi-Year Contract Discount Request",
				content: "Hi Valerie,\n\nGreat idea! We offer significant discounts for multi-year commitments:\n- 2 years: 10% discount\n- 3 years: 15% discount\n- 5 years: 20% discount\n\nPlus you get pricing protection against future increases.\n\nShall we revise your proposal?\n\nBest,\nSarah",
			},
		},
		{
			{
				subject: "Implementation Delay - Resource Constraints",
				content: "Sarah,\n\nWe need to delay implementation by 2 months due to internal resource constraints.\n\nCan we adjust our timeline without affecting pricing?\n\nSorry for the inconvenience.\n\nBest,\nEric Johnson\nProject Manager",
			},
		},
		{
			{
				subject: "Success Story - 40% Efficiency Improvement!",
				content: "Sarah,\n\nI wanted to share some great news. After 6 months of using your platform, we're seeing a 40% improvement in process efficiency.\n\nOur CEO is thrilled and wants to expand to other divisions.\n\nCan we set up a meeting to discuss expansion plans?\n\nThank you for the excellent solution!\n\nBest,\nLinda Park\nCOO",
			},
		},
		{
			{
				subject: "Compliance Requirements - GDPR and SOX",
				content: "Hi Sarah,\n\nWe need to ensure your platform meets GDPR and SOX compliance requirements.\n\nCan you provide detailed compliance documentation?\n\nThis is critical for our decision.\n\nThanks,\nMark Thompson\nCompliance Officer",
			},
			{
				subject: "Re: Compliance Requirements - GDPR and SOX",
				content: "Hi Mark,\n\nWe're fully compliant with both GDPR and SOX. I'll send you our compliance certification documents today.\n\nWe also have audit trails and data governance features specifically for compliance.\n\nHappy to arrange a call with our compliance team if needed.\n\nBest,\nSarah",
			},
		},
		{
			{
				subject: "Cold Outreach - Saw Your Company in TechCrunch",
				content: "Hi Sarah,\n\nI saw your company featured in TechCrunch about workflow automation. We're struggling with similar challenges at GrowthCo.\n\nWould you be open to a brief conversation about how you might help us?\n\nBest,\nJennifer Adams\nCEO, GrowthCo",
			},
		},
		{
			{
				subject: "Webinar Follow-up - Interested in Demo",
				content: "Sarah,\n\nI attended your webinar on automation best practices yesterday. Very insightful!\n\nI'd like to schedule a demo to see how it applies to our use case.\n\nWhen are you available next week?\n\nBest regards,\nPatrick Lee\nOperations Manager",
			},
			{
				subject: "Re: Webinar Follow-up - Interested in Demo",
				content: "Hi Patrick,\n\nSo glad you found the webinar valuable! I'd be happy to show you how those concepts apply specifically to your situation.\n\nI have availability Tuesday at 11 AM or Thursday at 2 PM. Which works better?\n\nLooking forward to our demo!\n\nBest,\nSarah",
			},
		},
		{
			{
				subject: "Proof of Concept Results - Moving Forward",
				content: "Hi Sarah,\n\nOur 2-week proof of concept was a success! The team is impressed with the results.\n\nWe're ready to move forward with a full implementation.\n\nWhat's the next step?\n\nBest,\nAlex Rodriguez\nVP of Engineering",
			},
		},
		{
			{
				subject: "Board Approved! Ready to Sign Contract",
				content: "Sarah,\n\nGreat news! The board approved our proposal yesterday.\n\nWe're ready to sign the contract and begin implementation.\n\nCan you send the final paperwork?\n\nExcited to get started!\n\nBest,\nMonica Davis\nCOO",
			},
			{
				subject: "Re: Board Approved! Ready to Sign Contract",
				content: "Hi Monica,\n\nFantastic news! Congratulations on getting board approval.\n\nI'm sending the final contract documents now. Once signed, we'll schedule your implementation kickoff.\n\nWelcome to the team!\n\nBest,\nSarah",
			},
		},
		{
			{
				subject: "Competitor Analysis - Why Choose You?",
				content: "Sarah,\n\nWe're evaluating 3 solutions including yours. What makes your platform uniquely better than the competition?\n\nSpecific differentiators would be helpful.\n\nThanks,\nJason Chen\nTechnology Director",
			},
		},
		{
			{
				subject: "Custom Development Request - Specific Integration",
				content: "Hi Sarah,\n\nWe need a custom integration with our legacy system. Your standard APIs won't work for our use case.\n\nDo you do custom development? What would be the cost and timeline?\n\nThis is critical for our decision.\n\nBest,\nRebecca Miller\nSystems Architect",
			},
			{
				subject: "Re: Custom Development Request - Specific Integration",
				content: "Hi Rebecca,\n\nWe do custom development for strategic clients. Based on your requirements, I estimate 6-8 weeks and $25-35K.\n\nLet me connect you with our CTO for a technical discussion to refine the scope and timeline.\n\nBest,\nSarah",
			},
		},
		{
			{
				subject: "Pilot Extension Request - Need More Time",
				content: "Sarah,\n\nWe're seeing good results from our pilot but need to extend it another month to complete our evaluation.\n\nIs this possible without additional cost?\n\nThanks,\nKevin Wong\nProject Lead",
			},
		},
		{
			{
				subject: "Enterprise Features - Advanced Security",
				content: "Hi Sarah,\n\nWe need enterprise-level security features including SSO, advanced user permissions, and audit logging.\n\nAre these available? What's the additional cost?\n\nBest,\nSharon Johnson\nSecurity Director",
			},
			{
				subject: "Re: Enterprise Features - Advanced Security",
				content: "Hi Sharon,\n\nAll those features are included in our Enterprise tier at no additional cost!\n\nWe also have role-based access controls and integration with popular SSO providers.\n\nWould you like a demo of the security features?\n\nBest,\nSarah",
			},
		},
		{
			{
				subject: "Seasonal Demand - Temporary User Increase",
				content: "Sarah,\n\nWe have seasonal demand that requires 50 additional users for 4 months per year.\n\nDo you offer flexible licensing for temporary users?\n\nThanks,\nBrad Wilson\nOperations Manager",
			},
		},
		{
			{
				subject: "International Expansion - Multi-Currency Support",
				content: "Hi Sarah,\n\nWe're expanding to Europe and Asia. Does your platform support multiple currencies and languages?\n\nAlso, do you have data centers in those regions?\n\nBest,\nCynthia Lee\nGlobal Operations",
			},
			{
				subject: "Re: International Expansion - Multi-Currency Support",
				content: "Hi Cynthia,\n\nYes! We support 25+ currencies and 12 languages. We also have data centers in EU and APAC for compliance and performance.\n\nI'd love to discuss your global expansion plans and how we can support them.\n\nCan we schedule a call?\n\nBest,\nSarah",
			},
		},
		{
			{
				subject: "Technology Roadmap - Future Development",
				content: "Sarah,\n\nBefore we commit, we'd like to understand your technology roadmap for the next 2-3 years.\n\nWhat new features and capabilities are planned?\n\nThanks,\nDr. Michael Zhang\nCTO",
			},
		},
		{
			{
				subject: "Performance Benchmarks - Scalability Questions",
				content: "Hi Sarah,\n\nWe process 10M+ transactions daily. Can your platform handle this volume?\n\nDo you have performance benchmarks for high-volume customers?\n\nBest,\nRyan Park\nInfrastructure Lead",
			},
			{
				subject: "Re: Performance Benchmarks - Scalability Questions",
				content: "Hi Ryan,\n\n10M+ transactions is well within our capabilities. Our largest customer processes 50M+ daily transactions.\n\nI can share performance benchmarks and architecture details. Would you like a technical deep-dive call?\n\nBest,\nSarah",
			},
		},
		{
			{
				subject: "Startup Discount Program - Early Stage Company",
				content: "Sarah,\n\nWe're an early-stage startup with limited budget but high growth potential.\n\nDo you have a startup discount program?\n\nWe could be a great case study customer as we scale.\n\nThanks,\nEmily Chen\nCEO, StartupCorp",
			},
		},
		{
			{
				subject: "Non-Profit Pricing - Educational Institution",
				content: "Hi Sarah,\n\nWe're a non-profit educational institution. Do you offer special pricing for organizations like ours?\n\nWe have 500 users across multiple departments.\n\nBest,\nProfessor James Wilson\nIT Director, University",
			},
			{
				subject: "Re: Non-Profit Pricing - Educational Institution",
				content: "Hi Professor Wilson,\n\nWe offer 40% discounts for educational institutions and non-profits.\n\nI'd be happy to prepare a custom proposal with educational pricing.\n\nWe also have several universities as reference customers.\n\nBest,\nSarah",
			},
		},
		{
			{
				subject: "API Rate Limits - High Volume Usage",
				content: "Sarah,\n\nWe'll have very high API usage - potentially millions of calls per day.\n\nWhat are your API rate limits and pricing for high-volume usage?\n\nThanks,\nDavid Kumar\nAPI Architect",
			},
		},
		{
			{
				subject: "White Label Solution - Reseller Opportunity",
				content: "Hi Sarah,\n\nWe're interested in white-labeling your solution for our clients.\n\nDo you offer white-label licensing? What would the terms look like?\n\nWe have 50+ potential clients.\n\nBest,\nCarla Rodriguez\nPartnership Director",
			},
			{
				subject: "Re: White Label Solution - Reseller Opportunity",
				content: "Hi Carla,\n\nWe do offer white-label solutions for qualified partners. This sounds like a great opportunity!\n\n50+ clients would definitely qualify for our partner program.\n\nCan we schedule a partnership discussion call?\n\nBest,\nSarah",
			},
		},
		{
			{
				subject: "Due Diligence - Technical Architecture Review",
				content: "Sarah,\n\nOur technical team needs to review your architecture, security practices, and infrastructure before we can proceed.\n\nCan you arrange a technical due diligence session?\n\nThis is for a potential $2M+ deal.\n\nThanks,\nRichard Kim\nChief Architect",
			},
		},
		{
			{
				subject: "Government Contract - Compliance Requirements",
				content: "Hi Sarah,\n\nWe're a government contractor and need FedRAMP compliance.\n\nDo you have government-approved versions of your platform?\n\nThis would be a significant multi-year contract.\n\nBest,\nColonel Sarah Martinez\nProgram Director",
			},
			{
				subject: "Re: Government Contract - Compliance Requirements",
				content: "Hi Colonel Martinez,\n\nWe have FedRAMP Moderate authorization and serve several government agencies.\n\nI'd like to connect you with our Government Solutions team who specialize in compliance requirements.\n\nThis sounds like a great opportunity.\n\nBest,\nSarah",
			},
		},
		{
			{
				subject: "Exit Interview - Why We Chose Competitor",
				content: "Sarah,\n\nWe decided to go with a different vendor. Here's why:\n- Lower total cost of ownership\n- Better integration with our existing systems\n- More flexible contract terms\n\nThanks for your time during the process.\n\nBest,\nTina Wang\nProcurement Manager",
			},
		},
		{
			{
				subject: "Win-Back Opportunity - Competitor Not Working Out",
				content: "Hi Sarah,\n\nThe solution we chose instead of yours isn't working out well. We're reconsidering our options.\n\nAre you still interested in our business? Has your pricing changed?\n\nCan we restart discussions?\n\nThanks,\nJeff Brown\nCTO",
			},
			{
				subject: "Re: Win-Back Opportunity - Competitor Not Working Out",
				content: "Hi Jeff,\n\nI'm sorry to hear your current solution isn't meeting expectations, but I'm definitely interested in helping you find the right fit.\n\nOur platform has improved significantly since we last spoke, and I think we can address your previous concerns.\n\nWhen would you like to reconnect?\n\nBest,\nSarah",
			},
		},
		{
			{
				subject: "IPO Preparation - Vendor Consolidation",
				content: "Sarah,\n\nWe're preparing for IPO and consolidating vendors. Your platform fits our long-term strategy.\n\nCan we discuss enterprise-level terms and multi-year agreements?\n\nThis could be a significant expansion of our relationship.\n\nBest,\nRobert Chen\nChief Strategy Officer",
			},
		},
	}
)
