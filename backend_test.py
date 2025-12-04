#!/usr/bin/env python3
"""
Backend API Testing for Planned Workout Scheduling System
Tests all planned workout endpoints and recurring logic
"""

import requests
import json
from datetime import datetime, timedelta
import sys
import os

# Get backend URL from frontend .env file
BACKEND_URL = "https://gympal-25.preview.emergentagent.com/api"

class TestResults:
    def __init__(self):
        self.passed = 0
        self.failed = 0
        self.errors = []
        
    def assert_test(self, condition, test_name, error_msg=""):
        if condition:
            print(f"✅ {test_name}")
            self.passed += 1
        else:
            print(f"❌ {test_name}: {error_msg}")
            self.failed += 1
            self.errors.append(f"{test_name}: {error_msg}")
            
    def print_summary(self):
        total = self.passed + self.failed
        print(f"\n{'='*60}")
        print(f"TEST SUMMARY: {self.passed}/{total} tests passed")
        if self.errors:
            print(f"\nFAILED TESTS:")
            for error in self.errors:
                print(f"  - {error}")
        print(f"{'='*60}")

def test_planned_workouts():
    """Test all planned workout functionality"""
    results = TestResults()
    
    print(f"Testing Backend API at: {BACKEND_URL}")
    print("="*60)
    
    # Test variables
    auth_token = None
    user_id = None
    template_id = None
    planned_workout_ids = []
    workout_session_id = None
    
    try:
        # 1. Test user registration/login
        print("\n1. AUTHENTICATION TESTS")
        print("-" * 30)
        
        # Register test user
        register_data = {
            "email": "plannedworkout.tester@example.com",
            "password": "testpass123"
        }
        
        response = requests.post(f"{BACKEND_URL}/auth/register", json=register_data)
        if response.status_code == 400 and "already registered" in response.text:
            # User exists, try login
            response = requests.post(f"{BACKEND_URL}/auth/login", json=register_data)
        
        results.assert_test(
            response.status_code == 200,
            "User authentication",
            f"Status: {response.status_code}, Response: {response.text}"
        )
        
        if response.status_code == 200:
            auth_data = response.json()
            auth_token = auth_data.get("token")
            user_id = auth_data.get("id")
            
        headers = {"Authorization": f"Bearer {auth_token}"} if auth_token else {}
        
        # 2. Create a workout template for testing
        print("\n2. TEMPLATE SETUP")
        print("-" * 30)
        
        template_data = {
            "name": "Test Push Workout",
            "notes": "Test template for planned workouts",
            "exercises": [
                {
                    "exercise_id": "test_exercise_1",
                    "order": 0,
                    "sets": [
                        {"weight": 60, "reps": 10, "is_warmup": False},
                        {"weight": 70, "reps": 8, "is_warmup": False},
                        {"weight": 80, "reps": 6, "is_warmup": False}
                    ]
                }
            ]
        }
        
        response = requests.post(f"{BACKEND_URL}/templates", json=template_data, headers=headers)
        results.assert_test(
            response.status_code == 200,
            "Create workout template",
            f"Status: {response.status_code}, Response: {response.text}"
        )
        
        if response.status_code == 200:
            template_id = response.json().get("id")
        
        # 3. Test Create One-Time Planned Workout
        print("\n3. ONE-TIME PLANNED WORKOUT TESTS")
        print("-" * 30)
        
        one_time_data = {
            "date": "2025-06-15",
            "name": "Push Day",
            "template_id": template_id,
            "order": 0,
            "is_recurring": False
        }
        
        response = requests.post(f"{BACKEND_URL}/planned-workouts", json=one_time_data, headers=headers)
        results.assert_test(
            response.status_code == 200,
            "Create one-time planned workout",
            f"Status: {response.status_code}, Response: {response.text}"
        )
        
        if response.status_code == 200:
            workout_data = response.json()
            planned_workout_ids.append(workout_data.get("id"))
            results.assert_test(
                workout_data.get("name") == "Push Day",
                "One-time workout has correct name"
            )
            results.assert_test(
                workout_data.get("is_recurring") == False,
                "One-time workout is not recurring"
            )
            results.assert_test(
                workout_data.get("template_id") == template_id,
                "One-time workout has correct template_id"
            )
        
        # 4. Test Create Daily Recurring Workout
        print("\n4. DAILY RECURRING WORKOUT TESTS")
        print("-" * 30)
        
        daily_data = {
            "date": "2025-06-10",
            "name": "Morning Cardio",
            "is_recurring": True,
            "recurrence_type": "daily",
            "recurrence_end_date": "2025-06-20"
        }
        
        response = requests.post(f"{BACKEND_URL}/planned-workouts", json=daily_data, headers=headers)
        results.assert_test(
            response.status_code == 200,
            "Create daily recurring workout",
            f"Status: {response.status_code}, Response: {response.text}"
        )
        
        if response.status_code == 200:
            workout_data = response.json()
            planned_workout_ids.append(workout_data.get("id"))
            results.assert_test(
                workout_data.get("is_recurring") == True,
                "Daily workout is recurring"
            )
            results.assert_test(
                workout_data.get("recurrence_type") == "daily",
                "Daily workout has correct recurrence type"
            )
        
        # 5. Test Create Weekly Recurring Workout
        print("\n5. WEEKLY RECURRING WORKOUT TESTS")
        print("-" * 30)
        
        weekly_data = {
            "date": "2025-06-09",
            "name": "Leg Day",
            "is_recurring": True,
            "recurrence_type": "weekly",
            "recurrence_days": [0, 3],  # Monday and Thursday
            "recurrence_end_date": "2025-07-09"
        }
        
        response = requests.post(f"{BACKEND_URL}/planned-workouts", json=weekly_data, headers=headers)
        results.assert_test(
            response.status_code == 200,
            "Create weekly recurring workout",
            f"Status: {response.status_code}, Response: {response.text}"
        )
        
        if response.status_code == 200:
            workout_data = response.json()
            planned_workout_ids.append(workout_data.get("id"))
            results.assert_test(
                workout_data.get("recurrence_type") == "weekly",
                "Weekly workout has correct recurrence type"
            )
            results.assert_test(
                workout_data.get("recurrence_days") == [0, 3],
                "Weekly workout has correct recurrence days"
            )
        
        # 6. Test Get Workouts for Specific Date
        print("\n6. GET WORKOUTS FOR SPECIFIC DATE TESTS")
        print("-" * 30)
        
        # Test date that should have daily workout (2025-06-12)
        response = requests.get(f"{BACKEND_URL}/planned-workouts?date=2025-06-12", headers=headers)
        results.assert_test(
            response.status_code == 200,
            "Get workouts for specific date",
            f"Status: {response.status_code}, Response: {response.text}"
        )
        
        if response.status_code == 200:
            workouts = response.json()
            results.assert_test(
                isinstance(workouts, list),
                "Response is a list"
            )
            
            # Should have daily workout on this date
            daily_workouts = [w for w in workouts if w.get("name") == "Morning Cardio"]
            results.assert_test(
                len(daily_workouts) > 0,
                "Daily recurring workout appears on specific date"
            )
        
        # Test Thursday (2025-06-12) which should have both daily and weekly (if Thursday is day 3)
        response = requests.get(f"{BACKEND_URL}/planned-workouts?date=2025-06-12", headers=headers)
        if response.status_code == 200:
            workouts = response.json()
            # Check if we have multiple workouts (daily + weekly if Thursday)
            print(f"  Found {len(workouts)} workouts for 2025-06-12")
        
        # 7. Test Get Workouts for Date Range
        print("\n7. GET WORKOUTS FOR DATE RANGE TESTS")
        print("-" * 30)
        
        response = requests.get(f"{BACKEND_URL}/planned-workouts?start_date=2025-06-10&end_date=2025-06-20", headers=headers)
        results.assert_test(
            response.status_code == 200,
            "Get workouts for date range",
            f"Status: {response.status_code}, Response: {response.text}"
        )
        
        if response.status_code == 200:
            workouts = response.json()
            results.assert_test(
                isinstance(workouts, list),
                "Date range response is a list"
            )
            
            # Should have multiple instances of daily workout
            daily_instances = [w for w in workouts if w.get("name") == "Morning Cardio"]
            results.assert_test(
                len(daily_instances) >= 10,  # Should have 11 days (10th to 20th inclusive)
                f"Daily workout expanded correctly (found {len(daily_instances)} instances)"
            )
            
            # Should have weekly instances on correct days
            weekly_instances = [w for w in workouts if w.get("name") == "Leg Day"]
            print(f"  Found {len(weekly_instances)} weekly workout instances")
        
        # 8. Test Update Planned Workout
        print("\n8. UPDATE PLANNED WORKOUT TESTS")
        print("-" * 30)
        
        if planned_workout_ids:
            update_data = {
                "name": "Updated Push Day",
                "status": "skipped"
            }
            
            response = requests.put(f"{BACKEND_URL}/planned-workouts/{planned_workout_ids[0]}", 
                                  json=update_data, headers=headers)
            results.assert_test(
                response.status_code == 200,
                "Update planned workout",
                f"Status: {response.status_code}, Response: {response.text}"
            )
            
            if response.status_code == 200:
                updated_workout = response.json()
                results.assert_test(
                    updated_workout.get("name") == "Updated Push Day",
                    "Workout name updated correctly"
                )
                results.assert_test(
                    updated_workout.get("status") == "skipped",
                    "Workout status updated correctly"
                )
        
        # 9. Test Get Specific Planned Workout
        print("\n9. GET SPECIFIC PLANNED WORKOUT TESTS")
        print("-" * 30)
        
        if planned_workout_ids:
            response = requests.get(f"{BACKEND_URL}/planned-workouts/{planned_workout_ids[0]}", headers=headers)
            results.assert_test(
                response.status_code == 200,
                "Get specific planned workout",
                f"Status: {response.status_code}, Response: {response.text}"
            )
        
        # 10. Test Link Workout Session to Planned Workout
        print("\n10. WORKOUT SESSION LINKING TESTS")
        print("-" * 30)
        
        if planned_workout_ids:
            workout_session_data = {
                "planned_workout_id": planned_workout_ids[0],
                "name": "Push Day Session"
            }
            
            response = requests.post(f"{BACKEND_URL}/workouts", json=workout_session_data, headers=headers)
            results.assert_test(
                response.status_code == 200,
                "Create workout session linked to planned workout",
                f"Status: {response.status_code}, Response: {response.text}"
            )
            
            if response.status_code == 200:
                session_data = response.json()
                workout_session_id = session_data.get("id")
                results.assert_test(
                    session_data.get("planned_workout_id") == planned_workout_ids[0],
                    "Workout session linked to planned workout"
                )
                
                # Check if planned workout status changed to "in_progress"
                response = requests.get(f"{BACKEND_URL}/planned-workouts/{planned_workout_ids[0]}", headers=headers)
                if response.status_code == 200:
                    planned_workout = response.json()
                    results.assert_test(
                        planned_workout.get("status") == "in_progress",
                        "Planned workout status changed to 'in_progress'"
                    )
        
        # 11. Test Complete Workout and Update Planned Status
        print("\n11. WORKOUT COMPLETION TESTS")
        print("-" * 30)
        
        if workout_session_id:
            completion_data = {
                "ended_at": datetime.utcnow().isoformat(),
                "exercises": [
                    {
                        "exercise_id": "test_exercise_1",
                        "order": 0,
                        "sets": [
                            {"weight": 60, "reps": 10, "is_warmup": False, "completed": True},
                            {"weight": 70, "reps": 8, "is_warmup": False, "completed": True}
                        ]
                    }
                ]
            }
            
            response = requests.put(f"{BACKEND_URL}/workouts/{workout_session_id}", 
                                  json=completion_data, headers=headers)
            results.assert_test(
                response.status_code == 200,
                "Complete workout session",
                f"Status: {response.status_code}, Response: {response.text}"
            )
            
            if response.status_code == 200:
                # Check if planned workout status changed to "completed"
                response = requests.get(f"{BACKEND_URL}/planned-workouts/{planned_workout_ids[0]}", headers=headers)
                if response.status_code == 200:
                    planned_workout = response.json()
                    results.assert_test(
                        planned_workout.get("status") == "completed",
                        "Planned workout status changed to 'completed'"
                    )
        
        # 12. Test Delete Planned Workout
        print("\n12. DELETE PLANNED WORKOUT TESTS")
        print("-" * 30)
        
        if len(planned_workout_ids) > 1:
            # Delete the second planned workout (keep first for other tests)
            response = requests.delete(f"{BACKEND_URL}/planned-workouts/{planned_workout_ids[1]}", headers=headers)
            results.assert_test(
                response.status_code == 200,
                "Delete planned workout",
                f"Status: {response.status_code}, Response: {response.text}"
            )
            
            # Verify it's deleted
            response = requests.get(f"{BACKEND_URL}/planned-workouts/{planned_workout_ids[1]}", headers=headers)
            results.assert_test(
                response.status_code == 404,
                "Deleted planned workout not found"
            )
        
        # 13. Test Edge Cases
        print("\n13. EDGE CASE TESTS")
        print("-" * 30)
        
        # Test invalid date format
        invalid_data = {
            "date": "invalid-date",
            "name": "Invalid Date Test",
            "is_recurring": False
        }
        
        response = requests.post(f"{BACKEND_URL}/planned-workouts", json=invalid_data, headers=headers)
        # This might pass or fail depending on validation - just log the result
        print(f"  Invalid date format test: Status {response.status_code}")
        
        # Test monthly recurring (if implemented)
        monthly_data = {
            "date": "2025-06-15",
            "name": "Monthly Strength Test",
            "is_recurring": True,
            "recurrence_type": "monthly",
            "recurrence_end_date": "2025-12-15"
        }
        
        response = requests.post(f"{BACKEND_URL}/planned-workouts", json=monthly_data, headers=headers)
        results.assert_test(
            response.status_code == 200,
            "Create monthly recurring workout",
            f"Status: {response.status_code}, Response: {response.text}"
        )
        
    except Exception as e:
        print(f"❌ Test execution error: {str(e)}")
        results.errors.append(f"Test execution error: {str(e)}")
        results.failed += 1
    
    # Print final results
    results.print_summary()
    return results.failed == 0

if __name__ == "__main__":
    print("Starting Planned Workout Backend API Tests...")
    success = test_planned_workouts()
    sys.exit(0 if success else 1)