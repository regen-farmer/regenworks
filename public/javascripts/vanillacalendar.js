var vanillacalendar = {
    month: document.querySelectorAll('[data-calendar-area="month"]')[0],
    next: document.querySelectorAll('[data-calendar-toggle="next"]')[0],
    previous: document.querySelectorAll('[data-calendar-toggle="previous"]')[0],
    label: document.querySelectorAll('[data-calendar-label="month"]')[0],
    activeDates: null,
    date: new Date(),
    todaysDate: new Date(),

    init: function () {
        this.date.setDate(1)
        this.createMonth()
        this.createListeners()
    },

    createListeners: function () {
        var _this = this
        this.next.addEventListener('click', function () {
            _this.clearCalendar()
            var nextMonth = _this.date.getMonth() + 1
            _this.date.setMonth(nextMonth)
            _this.createMonth()
        })
        // Clears the calendar and shows the previous month
        this.previous.addEventListener('click', function () {
            _this.clearCalendar()
            var prevMonth = _this.date.getMonth() - 1
            _this.date.setMonth(prevMonth)
            _this.createMonth()
        })
    },

    createDay: function (num, day, year) {
        var newDay = document.createElement('div')
        var dateEl = document.createElement('span')
        dateEl.innerHTML = num
        newDay.className = 'cal__date'
        newDay.setAttribute('data-calendar-date', this.date)

        if (num === 1) {
            var offset = ((day - 1) * 14.28)
            if (offset > 0) {
                newDay.style.marginLeft = offset + '%'
            }
        }

        // if (this.date.getTime() <= this.todaysDate.getTime() - 1) {
        //     newDay.classList.add('cal__date--disabled')
        // } else {
            newDay.classList.add('cal__date--active')
            newDay.setAttribute('data-calendar-status', 'active')
        // }

        if (this.date.toString() === this.todaysDate.toString()) {
            newDay.classList.add('cal__date--today')
        }

        for(var i = 0; i < activityArray.length; i++){
            if (Date.parse(activityArray[i].start.date) === (Math.floor((Date.parse(this.date)) / 86400000))*86400000) {
                newDay.classList.add('cal__date--event');
            }
        }

        newDay.appendChild(dateEl)
        this.month.appendChild(newDay)
    },

    dateClicked: function () {
        var _this = this
        this.activeDates = document.querySelectorAll('[data-calendar-status="active"]')
        for (var i = 0; i < this.activeDates.length; i++) {
            this.activeDates[i].addEventListener('click', function (event) {
                // var picked = document.querySelectorAll('[data-calendar-label="picked"]')[0]
                // picked.innerHTML = Date.parse(this.dataset.calendarDate);
                var pickedDate = Date.parse(this.dataset.calendarDate);
                var pickedDateFinal = (Math.floor(pickedDate / 86400000))*86400000;
                // SEND PICKED DATE TO HTML ELEMENT
                // WHEN NEW DATE IS PICKED, RENDER NEW ACTIVITIES
                var tasksOnPicked = document.querySelectorAll('[data-calendar-label="tasks"]')[0];
                var pickedDateActivities = "";
                for(var i = 0; i < activityArray.length; i++){
                    if (Date.parse(activityArray[i].start.date) === pickedDateFinal) {
                        pickedDateActivities = pickedDateActivities + "<div class='col-md-12'><a href='activities/" + activityArray[i]._id + "' class='btn btn-default btn-block'><p>" +
                            activityArray[i].name +
                            "</p></a></div>";
                    }
                }
                tasksOnPicked.innerHTML = pickedDateActivities;
                _this.removeActiveClass();
                this.classList.add('cal__date--selected')
            })
        }
    },

    createMonth: function () {
        var currentMonth = this.date.getMonth()
        while (this.date.getMonth() === currentMonth) {
            this.createDay(this.date.getDate(), this.date.getDay(), this.date.getFullYear())
            this.date.setDate(this.date.getDate() + 1)
        }
        // while loop trips over and day is at 30/31, bring it back
        this.date.setDate(1)
        this.date.setMonth(this.date.getMonth() - 1)

        this.label.innerHTML = this.monthsAsString(this.date.getMonth()) + ' ' + this.date.getFullYear()
        this.dateClicked()
    },

    monthsAsString: function (monthIndex) {
        return [
            'January',
            'Febuary',
            'March',
            'April',
            'May',
            'June',
            'July',
            'August',
            'September',
            'October',
            'November',
            'December'
        ][monthIndex]
    },

    clearCalendar: function () {
        vanillacalendar.month.innerHTML = ''
    },

    removeActiveClass: function () {
        for (var i = 0; i < this.activeDates.length; i++) {
            this.activeDates[i].classList.remove('cal__date--selected')
        }
    }
}
